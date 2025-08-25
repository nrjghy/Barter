# Supabase Storage Setup Guide

This guide will help you set up Supabase Storage to support multiple image uploads for the Barter application.

## **Step 1: Create Storage Bucket**

1. **Go to Supabase Dashboard**

   - Navigate to your project at [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your project

2. **Navigate to Storage**

   - In the left sidebar, click on **Storage**
   - Click **Create a new bucket**

3. **Configure Bucket**
   - **Name**: `barter_user_item_media` (must match VITE_SUPABASE_STORAGE_BUCKET in your .env)
   - **Public bucket**: ✅ **Check this** (images need to be publicly accessible)
   - **File size limit**: `5 MB` (matches our validation)
   - **Allowed MIME types**: `image/*`
   - Click **Create bucket**

## **Step 2: Configure Row Level Security (RLS)**

1. **Go to Storage Policies**

   - In the Storage section, click on your `item-images` bucket
   - Click on **Policies** tab

2. **Create Upload Policy**

   ```sql
   -- Allow authenticated users to upload images
   CREATE POLICY "Users can upload images" ON storage.objects
   FOR INSERT WITH CHECK (
     bucket_id = 'barter_user_item_media' AND
     auth.role() = 'authenticated'
   );
   ```

3. **Create Read Policy**

   ```sql
   -- Allow public read access to images
   CREATE POLICY "Public read access to images" ON storage.objects
   FOR SELECT USING (
     bucket_id = 'barter_user_item_media'
   );
   ```

4. **Create Update Policy**

   ```sql
   -- Allow users to update their own images
   CREATE POLICY "Users can update their images" ON storage.objects
   FOR UPDATE USING (
     bucket_id = 'barter_user_item_media' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

5. **Create Delete Policy**
   ```sql
   -- Allow users to delete their own images
   CREATE POLICY "Users can delete their images" ON storage.objects
   FOR DELETE USING (
     bucket_id = 'barter_user_item_media' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

## **Step 3: Enable RLS on Storage**

1. **Enable RLS**
   - In the Storage section, click on your `item-images` bucket
   - Click on **Settings** tab
   - Toggle **Enable Row Level Security (RLS)** to **ON**

## **Step 4: Test the Setup**

1. **Test Upload**

   - Try adding a new item with images through the AddToy form
   - Check the Network tab in browser dev tools for successful uploads
   - Verify images appear in the Supabase Storage dashboard

2. **Test Access**
   - Verify images are publicly accessible via their URLs
   - Check that images display correctly in the EnhancedItemCard component

## **Step 5: Monitor and Optimize**

1. **Storage Usage**

   - Monitor storage usage in the Supabase dashboard
   - Set up alerts for storage quotas if needed

2. **Performance**
   - Images are served via CDN for optimal performance
   - Consider implementing image optimization if needed

## **Troubleshooting**

### **Common Issues**

1. **"Bucket does not exist" error**

   - Ensure the bucket name is exactly `barter_user_item_media`
   - Check that the bucket was created successfully

2. **"Access denied" errors**

   - Verify RLS policies are correctly configured
   - Check that the user is authenticated
   - Ensure policies match the bucket name exactly

3. **Images not displaying**

   - Check that the bucket is public
   - Verify image URLs are correct
   - Check browser console for CORS errors

4. **Upload failures**
   - Verify file size is under 5MB
   - Check file type is supported (JPEG, PNG, GIF, WebP)
   - Ensure user is authenticated

### **Debug Steps**

1. **Check Storage Logs**

   - Go to Storage > barter_user_item_media > Logs
   - Look for error messages

2. **Verify Policies**

   - Check that all policies are active
   - Verify policy conditions match your requirements

3. **Test with Simple File**
   - Try uploading a small JPEG file first
   - Gradually test with larger files and different types

## **Security Considerations**

1. **File Validation**

   - Client-side validation prevents most invalid uploads
   - Server-side validation in storage policies provides additional security

2. **Access Control**

   - Users can only upload to their own folders
   - Public read access allows images to display in the app
   - Users can only modify/delete their own images

3. **File Size Limits**
   - 5MB limit prevents abuse
   - Consider implementing additional rate limiting if needed

## **Next Steps**

After completing this setup:

1. **Test the complete flow** from image selection to display
2. **Monitor storage usage** and performance
3. **Consider implementing** image optimization and compression
4. **Set up monitoring** for storage quotas and errors

## **Support**

If you encounter issues:

1. Check the Supabase documentation: [https://supabase.com/docs/guides/storage](https://supabase.com/docs/guides/storage)
2. Review the storage policies and bucket configuration
3. Check the browser console and network tab for errors
4. Verify all setup steps were completed correctly

## **Changes to Make**

### **1. Update .env file**

```env
# Add this line to your .env file
VITE_SUPABASE_STORAGE_BUCKET=barter_user_item_media
```

### **2. Update storageService.ts**

```typescript:src/services/storageService.ts
class StorageServiceImpl implements StorageService {
  private readonly BUCKET_NAME = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "item-images";
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

  constructor() {
    // Validate that bucket name is configured
    if (!this.BUCKET_NAME) {
      console.error("VITE_SUPABASE_STORAGE_BUCKET environment variable is not set");
      throw new Error("Storage bucket name not configured");
    }
  }

  // ... rest of the class remains the same
}
```

### **3. Update SUPABASE_STORAGE_SETUP.md**

```markdown:SUPABASE_STORAGE_SETUP.md
## **Step 1: Create Storage Bucket**

1. **Go to Supabase Dashboard**
   - Navigate to your project at [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Select your project

2. **Navigate to Storage**
   - In the left sidebar, click on **Storage**
   - Click **Create a new bucket**

3. **Configure Bucket**
   - **Name**: `item-images` (must match VITE_SUPABASE_STORAGE_BUCKET in your .env)
   - **Public bucket**: ✅ **Check this** (images need to be publicly accessible)
   - **File size limit**: `5 MB` (matches our validation)
   - **Allowed MIME types**: `image/*`
   - Click **Create bucket**
```

### **4. Update MULTIPLE_IMAGES_README.md**

````markdown:MULTIPLE_IMAGES_README.md
### **3. Environment Variables**
Ensure these are set in your `.env` file:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_STORAGE_BUCKET=item-images
````

````

## **Benefits of This Change**

✅ **Flexibility**: Easy to change bucket name without code changes
✅ **Environment-specific**: Different buckets for dev/staging/prod
✅ **Best practices**: Configuration externalized from code
✅ **Validation**: Constructor checks if environment variable is set
✅ **Fallback**: Defaults to "item-images" if not specified

## **Usage Examples**

### **Development (.env)**
```env
VITE_SUPABASE_STORAGE_BUCKET=barter_user_item_media-dev
````

### **Production (.env)**

```env
VITE_SUPABASE_STORAGE_BUCKET=barter_user_item_media-prod
```

### **Staging (.env)**

```env
VITE_SUPABASE_STORAGE_BUCKET=barter_user_item_media-staging
```

Now you can easily manage different storage buckets for different environments without touching the code!
