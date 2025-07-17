import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, CheckCircle, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { CarousellScraper, generateMockCarousellListings } from '../services/carousellScraper';
import { LoadingSpinner } from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

export const CarousellImport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: number } | null>(null);
  const [lastImport, setLastImport] = useState<Date | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setImportResults(null);
    
    try {
      const scraper = new CarousellScraper();
      
      // For demonstration, we'll use mock data since actual scraping requires CORS proxy
      // In production, you would use: const listings = await scraper.scrapeListings();
      const listings = generateMockCarousellListings();
      
      if (listings.length === 0) {
        toast.error('No listings found to import');
        return;
      }
      
      toast.success(`Found ${listings.length} listings to import`);
      
      const results = await scraper.importToDatabase(listings);
      setImportResults(results);
      setLastImport(new Date());
      
      if (results.success > 0) {
        toast.success(`Successfully imported ${results.success} listings!`);
      }
      
      if (results.errors > 0) {
        toast.error(`Failed to import ${results.errors} listings`);
      }
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import listings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Carousell Import</h1>
        <p className="text-gray-600">
          Import free item listings from Carousell Singapore to expand your Barter inventory.
        </p>
      </div>

      {/* Import Status Card */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Import Status</h2>
            <p className="text-gray-600">
              Last import: {lastImport ? lastImport.toLocaleString() : 'Never'}
            </p>
          </div>
          
          <motion.button
            onClick={handleImport}
            disabled={loading}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            {loading ? (
              <LoadingSpinner />
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Import Listings</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Results */}
        {importResults && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-900">Successfully Imported</p>
                  <p className="text-2xl font-bold text-green-600">{importResults.success}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <div>
                  <p className="font-semibold text-red-900">Failed Imports</p>
                  <p className="text-2xl font-bold text-red-600">{importResults.errors}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Source Information */}
      <div className="bg-blue-50 rounded-2xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Source Information</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Source Platform:</span>
            <span className="font-medium">Carousell Singapore</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Category:</span>
            <span className="font-medium">Free Items</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Source URL:</span>
            <a
              href="https://www.carousell.sg/categories/free-items-1898/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 font-medium"
            >
              <span>View Category</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">Import Limit:</span>
            <span className="font-medium">10 items per run</span>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <div className="bg-gray-50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Details</h3>
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Data Extraction:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Scrapes free item listings from Carousell Singapore</li>
              <li>Extracts title, description, images, location, and seller information</li>
              <li>Preserves original listing URLs for reference</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Rate Limiting:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>2-second delay between requests to respect server resources</li>
              <li>Automatic retry mechanism for failed requests</li>
              <li>Handles rate limiting with exponential backoff</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Data Processing:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Validates data format before database insertion</li>
              <li>Prevents duplicate imports using source URL tracking</li>
              <li>Creates demo user account for imported listings</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Demo Notice */}
      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">Demo Mode:</p>
            <p>
              This demo uses mock data to simulate the Carousell import process. 
              In a production environment, the scraper would fetch real listings from Carousell's website 
              using a CORS proxy or server-side implementation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};