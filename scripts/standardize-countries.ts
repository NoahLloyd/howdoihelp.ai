import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const countryMap: Record<string, string> = {
    'EE. UU.': 'USA',
    'United States': 'USA',
    'US': 'USA',
    'CO': 'USA',
    'Deutschland': 'Germany',
    'Alemania': 'Germany',
    'Türkiye': 'Turkey',
    'México': 'Mexico',
    'Italia': 'Italy',
    'Ιταλία': 'Italy',
    'Canadá': 'Canada',
    'The Netherlands': 'Netherlands',
    'Nederland': 'Netherlands',
    'Schweden': 'Sweden',
    'Sverige': 'Sweden',
    'Ελλάδα': 'Greece',
    'ベルギー': 'Belgium',
    'België': 'Belgium',
    'Espanha': 'Spain',
    'España': 'Spain',
    'Япония': 'Japan',
    'Japón': 'Japan',
    'Schweiz': 'Switzerland',
    'Suisse': 'Switzerland',
    'Polska': 'Poland',
    'Rakúsko': 'Austria',
    'Brasil': 'Brazil',
    'Yaoundé': 'Yaoundé, Cameroon',
    'Tallinn': 'Tallinn, Estonia',
    'Santiago': 'Santiago, Chile',
    'Fukuoka': 'Fukuoka, Japan',
    'Porto': 'Porto, Portugal',
    'Ashevil': 'Asheville, USA',
    'Abu Dhabi - United Arab Emirates': 'Abu Dhabi, United Arab Emirates',
    'AUS - Sharjah - United Arab Emirates': 'Sharjah, United Arab Emirates',
    'WA': 'WA, Australia',
    'where': 'Online',
    'PauseAI en Español': 'Online',
    'Australasia': 'Australia',
};

async function standardizeCountries() {
    const { data, error } = await supabase
        .from('resources')
        .select('id, title, location')
        .not('location', 'is', null)
        .or('source.is.null,source.neq.aisafety');

    if (error) {
        console.error("Error fetching data:", error);
        return;
    }

    let updatedCount = 0;

    for (const item of data) {
        if (!item.location) continue;
        
        let newLocation = item.location;
        const parts = item.location.split(',');
        const lastPart = parts[parts.length - 1].trim();

        if (countryMap[lastPart]) {
            if (parts.length > 1) {
                 parts[parts.length - 1] = ' ' + countryMap[lastPart];
                 newLocation = parts.join(',');
            } else {
                 newLocation = countryMap[lastPart];
            }
        } else if (countryMap[item.location.trim()]) {
             newLocation = countryMap[item.location.trim()];
        } else {
             // For cases like "Bogotá, Colombia" it's fine.
             // What if the whole location string is like "Suisse"
             // Handled above.
        }

        if (newLocation !== item.location) {
            const { error: updateError } = await supabase
                .from('resources')
                .update({ location: newLocation })
                .eq('id', item.id);
                
            if (updateError) {
                console.error(`Failed to update ${item.id}:`, updateError.message);
            } else {
                updatedCount++;
                console.log(`Updated: "${item.location}" -> "${newLocation}"`);
            }
        }
    }

    console.log(`\nSuccessfully standardized ${updatedCount} locations to proper English names.`);
}

standardizeCountries();
