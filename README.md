# Barter App - Carousell Integration

## New Features
## Overview
### Carousell Integration
- **Automated Import**: Import free item listings from Carousell Singapore
- **Source Tracking**: Each imported item retains its original Carousell URL
- **Duplicate Prevention**: Prevents importing the same listing multiple times
- **Rate Limiting**: Respects Carousell's servers with appropriate delays
Barter is a modern item exchange platform that allows users to discover, match, and trade items with others. The app now includes integration with Carousell Singapore to import free item listings.
### Enhanced Item Details
- **Source URL Display**: Items imported from external sources show their original listing URL
- **External Link**: Direct access to original Carousell listings
- **Visual Indicators**: Clear labeling of imported vs. native items
## Technical Implementation
### Database Changes
- Added `source_url` field to items table
- Indexed for efficient lookups
- URL format validation constraints
### Scraping Service
- `CarousellScraper` class for data extraction
- Error handling and retry mechanisms
- Mock data generator for demonstration
### Import Process
1. Fetch category page from Carousell
2. Extract individual listing URLs
3. Scrape detailed information from each listing
4. Import to database with duplicate checking
5. Create demo user for imported listings
## Usage
### Importing Carousell Listings
1. Navigate to the Import page in the app
2. Click "Import Listings" button
3. System will fetch and import up to 10 free items
4. View import results and statistics
### Viewing Imported Items
- Imported items appear in the main discovery feed
- Item detail pages show "Original Listing" section
- Click "View Source" to visit the original Carousell listing
## Development Notes
### CORS Considerations
The current implementation uses mock data for demonstration due to CORS restrictions. In production:
- Use a server-side scraping service
- Implement a CORS proxy
- Consider using Carousell's API if available
### Rate Limiting
- 2-second delay between requests
- Exponential backoff for failed requests
- Respects robots.txt guidelines
### Data Validation
- URL format validation
- Required field checking
- Duplicate prevention by source URL
## Future Enhancements
- Real-time import scheduling
- Multiple source platform support
- Advanced filtering and categorization
- Seller verification for imported listings