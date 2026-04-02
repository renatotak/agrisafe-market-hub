import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { supabase } from '@/lib/supabase';

// Helper to fetch and parse Notícias Agrícolas (NA) prices
export async function GET(request: Request) {
  try {
    // Check for authorization to prevent unauthorized scraping
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch('https://www.noticiasagricolas.com.br/cotacoes/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgriSafe Bot (Market Data System)'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch NA prices: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const scrapedData: any[] = [];

    // The NA website has multiple tables for different commodities.
    // This is a simplified extraction pattern that would need robust adaptation based on specific DOM structure elements.
    $('.cotacao').each((i, el) => {
      const title = $(el).find('h2').text().trim();
      
      // Look for the rows under this quotation table
      $(el).find('table tbody tr').each((j, row) => {
        const columns = $(row).find('td');
        if (columns.length >= 2) {
          const locationOrType = $(columns[0]).text().trim();
          const price = $(columns[1]).text().trim();
          const variation = $(columns[2]).text().trim(); // If exists
          
          if (locationOrType && price) {
            scrapedData.push({
              commodity_title: title,
              location: locationOrType,
              price: price,
              variation: variation,
              source: 'Notícias Agrícolas',
              timestamp: new Date().toISOString()
            });
          }
        }
      });
    });

    // Determine how many records we got
    const count = scrapedData.length;

    // Ideally, we'd insert this into Supabase:
    // await supabase.from('commodity_prices_regional').insert(formattedData)
    // For now, logging and returning to ensure the cron works
    
    return NextResponse.json({ 
      success: true, 
      message: `Scraped ${count} price records from Notícias Agrícolas`, 
      data: scrapedData.slice(0, 50) // Return sample
    });

  } catch (error: any) {
    console.error('Error syncing prices from NA:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
