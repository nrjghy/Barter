import { supabase } from '../lib/supabase';

export interface CarousellListing {
  title: string;
  description: string;
  imageUrl: string;
  location: string;
  condition: string;
  sellerName: string;
  postedDate: string;
  sourceUrl: string;
  category: string;
}

export class CarousellScraper {
  private baseUrl = 'https://www.carousell.sg';
  private categoryUrl = 'https://www.carousell.sg/categories/free-items-1898/';
  private rateLimitDelay = 2000; // 2 seconds between requests

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(url: string, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
          }
        });
        
        if (response.ok) {
          return response;
        }
        
        if (response.status === 429) {
          // Rate limited, wait longer
          await this.delay(5000);
          continue;
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      } catch (error) {
        console.error(`Attempt ${i + 1} failed:`, error);
        if (i === retries - 1) throw error;
        await this.delay(this.rateLimitDelay * (i + 1));
      }
    }
    throw new Error('Max retries exceeded');
  }

  private parseCarousellHtml(html: string, sourceUrl: string): CarousellListing | null {
    try {
      // This is a simplified parser - in a real implementation, you'd use a proper HTML parser
      // For demonstration, we'll create mock data based on typical Carousell structure
      
      const titleMatch = html.match(/<title[^>]*>([^<]+)</title>/i);
      )
      const title = titleMatch ? titleMatch[1].replace(' | Carousell Singapore', '').trim() : 'Free Item';
      
      // Extract description from meta tags or content
      const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i);
      const description = descMatch ? descMatch[1] : 'Free item available for pickup';
      
      // Extract image URL
      const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);
      const imageUrl = imageMatch ? imageMatch[1] : '';
      
      // Extract location (this would need to be adapted based on actual HTML structure)
      const locationMatch = html.match(/location[^>]*>([^<]+)</i);
      const location = locationMatch ? locationMatch[1].trim() : 'Singapore';
      
      return {
        title,
        description,
        imageUrl,
        location,
        condition: 'Good', // Default for free items
        sellerName: 'Carousell User',
        postedDate: new Date().toISOString(),
        sourceUrl,
        category: 'Other'
      };
    } catch (error) {
      console.error('Error parsing HTML:', error);
      return null;
    }
  }

  private async getListingUrls(): Promise<string[]> {
    try {
      console.log('Fetching category page...');
      const response = await this.fetchWithRetry(this.categoryUrl);
      const html = await response.text();
      
      // Extract listing URLs from the category page
      // This regex would need to be adapted based on actual Carousell HTML structure
      const urlMatches = html.match(/href="\/p\/[^"]+"/g) || [];
      const urls = urlMatches
        .map(match => match.replace('href="', '').replace('"', ''))
        .map(path => `${this.baseUrl}${path}`)
        .slice(0, 10); // Limit to 10 items as requested
      
      console.log(`Found ${urls.length} listing URLs`);
      return urls;
    } catch (error) {
      console.error('Error fetching listing URLs:', error);
      return [];
    }
  }

  private async scrapeListingDetails(url: string): Promise<CarousellListing | null> {
    try {
      console.log(`Scraping listing: ${url}`);
      await this.delay(this.rateLimitDelay);
      
      const response = await this.fetchWithRetry(url);
      const html = await response.text();
      
      return this.parseCarousellHtml(html, url);
    } catch (error) {
      console.error(`Error scraping listing ${url}:`, error);
      return null;
    }
  }

  public async scrapeListings(): Promise<CarousellListing[]> {
    try {
      const listingUrls = await this.getListingUrls();
      const listings: CarousellListing[] = [];
      
      for (const url of listingUrls) {
        const listing = await this.scrapeListingDetails(url);
        if (listing) {
          listings.push(listing);
        }
      }
      
      console.log(`Successfully scraped ${listings.length} listings`);
      return listings;
    } catch (error) {
      console.error('Error in scrapeListings:', error);
      return [];
    }
  }

  public async importToDatabase(listings: CarousellListing[]): Promise<{ success: number; errors: number }> {
    let success = 0;
    let errors = 0;
    
    // Create a demo user for Carousell listings if it doesn't exist
    const { data: demoUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('username', 'carousell_importer')
      .single();
    
    let userId = demoUser?.id;
    
    if (!demoUser) {
      // Create demo user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{
          id: crypto.randomUUID(),
          username: 'carousell_importer',
          location: 'Singapore',
          is_demo: true,
          rating: 4.5
        }])
        .select('id')
        .single();
      
      if (createError) {
        console.error('Error creating demo user:', createError);
        return { success: 0, errors: listings.length };
      }
      
      userId = newUser.id;
    }
    
    for (const listing of listings) {
      try {
        // Check if listing already exists
        const { data: existing } = await supabase
          .from('items')
          .select('id')
          .eq('source_url', listing.sourceUrl)
          .single();
        
        if (existing) {
          console.log(`Listing already exists: ${listing.title}`);
          continue;
        }
        
        // Insert new listing
        const { error } = await supabase
          .from('items')
          .insert([{
            user_id: userId,
            title: listing.title,
            description: listing.description,
            category: listing.category,
            condition: listing.condition,
            image_url: listing.imageUrl,
            source_url: listing.sourceUrl,
            tags: ['free', 'carousell'],
            is_active: true,
            price: 0 // Free items
          }]);
        
        if (error) {
          console.error(`Error inserting listing ${listing.title}:`, error);
          errors++;
        } else {
          console.log(`Successfully imported: ${listing.title}`);
          success++;
        }
      } catch (error) {
        console.error(`Error processing listing ${listing.title}:`, error);
        errors++;
      }
    }
    
    return { success, errors };
  }
}

// Mock data generator for demonstration (since actual scraping requires CORS proxy)
export function generateMockCarousellListings(): CarousellListing[] {
  const mockListings: CarousellListing[] = [
    {
      title: "Free Office Chair - Good Condition",
      description: "Giving away office chair in good condition. Some wear on armrests but still very comfortable. Perfect for home office setup.",
      imageUrl: "https://images.pexels.com/photos/1957477/pexels-photo-1957477.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Tampines, Singapore",
      condition: "Good",
      sellerName: "OfficeWorker123",
      postedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-office-chair-good-condition-1234567890",
      category: "Home & Garden"
    },
    {
      title: "Free Children's Books Collection",
      description: "Collection of children's books suitable for ages 5-10. Stories include fairy tales, adventure books, and educational content. Great for young readers!",
      imageUrl: "https://images.pexels.com/photos/1319854/pexels-photo-1319854.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Jurong West, Singapore",
      condition: "Very Good",
      sellerName: "BookLover88",
      postedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-childrens-books-collection-2345678901",
      category: "Books"
    },
    {
      title: "Free Potted Plants - Indoor Plants",
      description: "Moving house and can't take these beautiful indoor plants with me. Includes snake plant, pothos, and peace lily. All healthy and well-maintained.",
      imageUrl: "https://images.pexels.com/photos/1084199/pexels-photo-1084199.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Orchard, Singapore",
      condition: "Like New",
      sellerName: "PlantParent",
      postedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-potted-plants-indoor-plants-3456789012",
      category: "Home & Garden"
    },
    {
      title: "Free Kitchen Utensils Set",
      description: "Complete kitchen utensils set including spatulas, ladles, tongs, and measuring cups. All in good working condition. Perfect for new home setup.",
      imageUrl: "https://images.pexels.com/photos/1267320/pexels-photo-1267320.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Bedok, Singapore",
      condition: "Good",
      sellerName: "KitchenMaster",
      postedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-kitchen-utensils-set-4567890123",
      category: "Home & Garden"
    },
    {
      title: "Free Exercise Equipment - Yoga Mat & Weights",
      description: "Yoga mat in excellent condition and set of 2kg dumbbells. Great for home workouts. Mat is non-slip and easy to clean.",
      imageUrl: "https://images.pexels.com/photos/863926/pexels-photo-863926.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Clementi, Singapore",
      condition: "Very Good",
      sellerName: "FitnessGuru",
      postedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-exercise-equipment-yoga-mat-weights-5678901234",
      category: "Sports & Outdoors"
    },
    {
      title: "Free Board Games Collection",
      description: "Collection of family board games including Monopoly, Scrabble, and Uno. All games are complete with original pieces and instructions.",
      imageUrl: "https://images.pexels.com/photos/1040157/pexels-photo-1040157.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Hougang, Singapore",
      condition: "Good",
      sellerName: "GameNight",
      postedDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-board-games-collection-6789012345",
      category: "Toys & Games"
    },
    {
      title: "Free Computer Monitor - 19 inch",
      description: "19-inch LCD monitor in working condition. Some minor scratches on the frame but screen is clear. Includes power cable and VGA cable.",
      imageUrl: "https://images.pexels.com/photos/1029757/pexels-photo-1029757.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Toa Payoh, Singapore",
      condition: "Fair",
      sellerName: "TechGuy2023",
      postedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-computer-monitor-19-inch-7890123456",
      category: "Electronics"
    },
    {
      title: "Free Women's Clothing - Size M",
      description: "Assorted women's clothing in size M. Includes blouses, t-shirts, and casual wear. All items are clean and in good condition.",
      imageUrl: "https://images.pexels.com/photos/1926769/pexels-photo-1926769.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Bishan, Singapore",
      condition: "Good",
      sellerName: "FashionLover",
      postedDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-womens-clothing-size-m-8901234567",
      category: "Clothing"
    },
    {
      title: "Free Art Supplies - Paints & Brushes",
      description: "Art supplies including acrylic paints, brushes, and canvas boards. Perfect for beginners or art students. Some paints are partially used.",
      imageUrl: "https://images.pexels.com/photos/1047540/pexels-photo-1047540.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Ang Mo Kio, Singapore",
      condition: "Good",
      sellerName: "ArtisticSoul",
      postedDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-art-supplies-paints-brushes-9012345678",
      category: "Art & Crafts"
    },
    {
      title: "Free Baby Items - High Chair & Toys",
      description: "Baby high chair in good condition and assorted baby toys. High chair is adjustable and easy to clean. Toys are suitable for 6-18 months.",
      imageUrl: "https://images.pexels.com/photos/1148998/pexels-photo-1148998.jpeg?auto=compress&cs=tinysrgb&w=800",
      location: "Woodlands, Singapore",
      condition: "Good",
      sellerName: "NewParent",
      postedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      sourceUrl: "https://www.carousell.sg/p/free-baby-items-high-chair-toys-0123456789",
      category: "Toys & Games"
    }
  ];
  
  return mockListings;
}