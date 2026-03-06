import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import * as https from 'https';
import { estimateEventMinutes } from './lib/estimate-time';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GRAPHQL_QUERY = `
query multiPostQuery($input: MultiPostInput) {
  posts(input: $input) {
    results {
      _id
      title
      url
      location
      onlineEvent
      globalEvent
      startTime
      endTime
      isEvent
      contents {
        plaintextDescription
      }
    }
  }
}
`;

function fetchGraphQL(hostname: string, view: string): Promise<any> {
    const variables = {
        input: {
            terms: {
                view: view,
                isEvent: true,
                limit: 200, // Pull up to 200 upcoming events per platform per view
                lat: 0,
                lng: 0,
                distance: 50000 // Earth circumference is 40,000km, this captures all global events regardless of geolocation filtering
            }
        }
    };
    
    const payload = JSON.stringify({ query: GRAPHQL_QUERY, variables });
    
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: hostname,
            path: '/graphql',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.errors) {
                        console.error('GraphQL errors from', hostname, parsed.errors);
                        resolve([]);
                    } else {
                        resolve(parsed.data?.posts?.results || []);
                    }
                } catch (err) {
                    console.error('Error parsing JSON from', hostname);
                    resolve([]);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

const SOURCES = [
    { name: 'EA Forum', url: 'forum.effectivealtruism.org' },
    { name: 'LessWrong', url: 'www.lesswrong.com' }
];

async function syncEvents() {
    console.log("Starting event synchronization from global hubs...");
    let allEvents: any[] = [];
    
    for (const source of SOURCES) {
        console.log(`Fetching from ${source.name}...`);
        
        // nearbyEvents with no coordinates acts as a global upcoming events feed for VulcanJS
        const events = await fetchGraphQL(source.url, 'nearbyEvents');
        
        events.forEach((e: any) => e.source_name = source.name);
        
        allEvents = [...allEvents, ...events];
    }
    
    // Deduplicate by ID
    const uniqueEvents = new Map();
    for (const ev of allEvents) {
        if (!uniqueEvents.has(ev._id)) {
            uniqueEvents.set(ev._id, ev);
        }
    }
    
    const eventsArray = Array.from(uniqueEvents.values());
    console.log(`Extracted ${eventsArray.length} unique events from external APIs.`);
    
    // Fetch existing events so we don't overwrite manual edits
    const { data: existingRecords } = await supabase.from('resources').select('id').eq('category', 'events');
    const existingIds = new Set((existingRecords || []).map(r => r.id));
    
    let addedCount = 0;
    let skippedCount = 0;
    let existingCount = 0;

    for (const remote of eventsArray) {
        const generatedId = `sync-${remote.source_name.toLowerCase().replace(' ', '')}-${remote._id}`;
        
        // Skip events without a title or start time
        if (!remote.title || !remote.startTime) {
            skippedCount++;
            continue;
        }

        // Do not destructively overwrite anything if this event is already synced and manually edited by the admin
        if (existingIds.has(generatedId)) {
            existingCount++;
            continue;
        }

        // Determine link URL (use the external URL if provided, otherwise link back to the forum post)
        let finalUrl = remote.url;
        if (!finalUrl) {
           finalUrl = `https://${remote.source_name === 'EA Forum' ? 'forum.effectivealtruism.org' : 'www.lesswrong.com'}/events/${remote._id}`;
        }
        
        // Determine location
        let finalLocation = remote.location || '';
        if (remote.onlineEvent && !finalLocation) finalLocation = 'Online';
        if (remote.globalEvent && !finalLocation) finalLocation = 'Global';
        if (!finalLocation) finalLocation = 'Location TBD';
        
        // Standardize Description
        let desc = remote.contents?.plaintextDescription || '';
        // truncate to 300 chars for concise display
        if (desc.length > 300) {
            desc = desc.substring(0, 300).trim() + '...';
        }
        if (!desc) {
            desc = `Join this ${remote.source_name} community event discussing alignment, strategy, and safe artificial intelligence trajectories.`;
        }
        
        // Auto-scoring logic
        // Major hubs get slightly higher starting scores
        let score = 0.5;
        let friction = 0.1; // Usually low friction to attend an event
        let eventType = 'other';

        const lowerTitle = remote.title.toLowerCase();
        if (lowerTitle.includes('eag') || lowerTitle.includes('conference') || lowerTitle.includes('summit')) {
            score = 0.8;
            friction = 0.5; // Conferences have higher friction
            eventType = 'conference';
        } else if (lowerTitle.includes('hackathon')) {
            score = 0.7;
            friction = 0.3;
            eventType = 'hackathon';
        } else if (lowerTitle.includes('workshop')) {
            score = 0.7;
            friction = 0.3;
            eventType = 'workshop';
        } else if (lowerTitle.includes('meetup') || lowerTitle.includes('coffee') || lowerTitle.includes('social')) {
            score = 0.4; // Regular meetups
            friction = 0.05;
            eventType = 'meetup';
        } else if (lowerTitle.includes('talk') || lowerTitle.includes('lecture') || lowerTitle.includes('panel') || lowerTitle.includes('seminar') || lowerTitle.includes('presentation')) {
            eventType = 'talk';
        } else if (lowerTitle.includes('course') || lowerTitle.includes('reading group') || lowerTitle.includes('study group')) {
            eventType = 'course';
        } else if (lowerTitle.includes('fellowship') || lowerTitle.includes('internship')) {
            eventType = 'fellowship';
        }

        const startDate = remote.startTime?.substring(0, 10);
        const endDate = remote.endTime?.substring(0, 10);

        // Route fellowship/course/program types to programs category
        const PROGRAM_EVENT_TYPES = ['fellowship', 'course', 'program'];
        const category = PROGRAM_EVENT_TYPES.includes(eventType) ? 'programs' : 'events';

        const newResource = {
            id: generatedId,
            title: remote.title,
            description: desc,
            url: finalUrl,
            source_org: remote.source_name,
            category,
            location: finalLocation,
            min_minutes: estimateEventMinutes(eventType, startDate, endDate),
            ev_general: score,
            friction: friction,
            event_type: eventType,
            enabled: true,
            status: 'approved',
            event_date: remote.startTime.substring(0, 10), // Extract YYYY-MM-DD
            activity_score: 0.9, // Fresh scraped event => active
            url_status: 'reachable'
        };

        // Safely Insert without Upserting to prevent overwriting
        const { error } = await supabase
            .from('resources')
            .insert(newResource);

        if (error) {
            console.error(`Failed to insert ${newResource.id}:`, error.message);
        } else {
            addedCount++;
        }
    }
    
    console.log(`\nSynchronization Complete!`);
    console.log(`Successfully added: ${addedCount}`);
    console.log(`Preserved existing (no overwrite): ${existingCount}`);
    console.log(`Skipped (invalid payload): ${skippedCount}`);
}

syncEvents();
