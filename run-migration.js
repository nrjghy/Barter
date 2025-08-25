#!/usr/bin/env node

/**
 * Database Migration Script for Multiple Images Support
 *
 * This script adds the image_urls array column to the items table.
 * Run this after setting up Supabase Storage.
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:");
  console.error("   VITE_SUPABASE_URL");
  console.error("   SUPABASE_SERVICE_ROLE_KEY");
  console.error("\nPlease check your .env file and try again.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log("🚀 Starting database migration for multiple images support...\n");

  try {
    // Step 1: Add image_urls column
    console.log("📝 Adding image_urls column to items table...");
    const { error: alterError } = await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE items 
        ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';
      `,
    });

    if (alterError) {
      console.error("❌ Failed to add image_urls column:", alterError);
      throw alterError;
    }
    console.log("✅ image_urls column added successfully");

    // Step 2: Add comment
    console.log("📝 Adding column comment...");
    const { error: commentError } = await supabase.rpc("exec_sql", {
      sql: `
        COMMENT ON COLUMN items.image_urls IS 'Array of image URLs for the item. Each URL points to an image stored in Supabase Storage.';
      `,
    });

    if (commentError) {
      console.warn("⚠️  Warning: Could not add column comment:", commentError.message);
    } else {
      console.log("✅ Column comment added successfully");
    }

    // Step 3: Create index
    console.log("📝 Creating index for image_urls...");
    const { error: indexError } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_items_image_urls 
        ON items USING GIN (image_urls);
      `,
    });

    if (indexError) {
      console.warn("⚠️  Warning: Could not create index:", indexError.message);
    } else {
      console.log("✅ Index created successfully");
    }

    // Step 4: Verify the column exists
    console.log("🔍 Verifying migration...");
    const { data: columns, error: verifyError } = await supabase
      .from("information_schema.columns")
      .select("column_name, data_type, column_default")
      .eq("table_name", "items")
      .eq("column_name", "image_urls");

    if (verifyError) {
      console.error("❌ Failed to verify migration:", verifyError);
      throw verifyError;
    }

    if (columns && columns.length > 0) {
      const column = columns[0];
      console.log("✅ Migration verified successfully!");
      console.log(`   Column: ${column.column_name}`);
      console.log(`   Type: ${column.data_type}`);
      console.log(`   Default: ${column.column_default}`);
    } else {
      console.error("❌ Migration verification failed: image_urls column not found");
      throw new Error("Column not found after migration");
    }

    console.log("\n🎉 Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Set up Supabase Storage bucket (see SUPABASE_STORAGE_SETUP.md)");
    console.log("2. Test the multiple image upload functionality");
    console.log("3. Monitor storage usage and performance");
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Check your Supabase credentials");
    console.error("2. Ensure you have the service role key (not anon key)");
    console.error("3. Verify your database is accessible");
    console.error("4. Check the Supabase dashboard for any errors");

    process.exit(1);
  }
}

// Run the migration
runMigration();
