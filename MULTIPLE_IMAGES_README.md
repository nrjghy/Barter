# Multiple Image Upload Feature

This document describes the implementation of the multiple image upload feature for the Barter application.

## **Overview**

The multiple image upload feature allows users to:

- Upload up to 10 images per item
- Preview images before submission
- Remove individual images
- Store images securely in Supabase Storage
- Display images with indicators for multiple images

## **Architecture**

### **Frontend Components**

- **`AddToy.tsx`**: Enhanced form with multiple image selection and preview
- **`EnhancedItemCard.tsx`**: Displays first image with "+X more" indicator
- **Image preview grid**: 2-column layout showing all selected images

### **Backend Services**

- **`StorageService`**: Handles Supabase Storage operations
- **`ItemService`**: Manages item creation with image uploads
- **Database schema**: `image_urls` array column in `items` table

### **Data Flow**

1. User selects multiple images → File validation → Base64 previews
2. Form submission → Item creation → Image upload to storage
3. Storage URLs stored in database → Item updated with image URLs
4. Images displayed in UI with proper fallbacks

## **Features**

### **Image Selection**

- **Multiple file selection**: Up to 10 images
- **File validation**: Size (5MB), type (JPEG, PNG, GIF, WebP)
- **Drag & drop support**: Enhanced user experience

### **Image Preview**

- **Grid layout**: 2-column preview of all selected images
- **Individual removal**: Remove specific images before submission
- **Real-time updates**: Immediate UI feedback

### **Storage & Security**

- **Supabase Storage**: Secure cloud storage with CDN
- **Row Level Security**: Users can only access their own images
- **Organized structure**: `{userId}/{itemId}/{filename}` paths
- **Public access**: Images publicly viewable for app functionality

### **UI Enhancements**

- **Multiple images indicator**: Shows "+X more" on item cards
- **Fallback handling**: Graceful degradation for missing images
- **Loading states**: Smooth transitions and feedback

## **Implementation Details**

### **Database Changes**

```sql
-- New column for multiple images
ALTER TABLE items ADD COLUMN image_urls TEXT[] DEFAULT '{}';

-- Index for performance
CREATE INDEX idx_items_image_urls ON items USING GIN (image_urls);
```

### **Storage Structure**

```
item-images/
├── {userId}/
│   ├── {itemId}/
│   │   ├── {timestamp}_{randomId}_0.jpg
│   │   ├── {timestamp}_{randomId}_1.png
│   │   └── {timestamp}_{randomId}_2.gif
│   └── {anotherItemId}/
│       └── {timestamp}_{randomId}_0.jpg
```

### **File Naming Convention**

- **Format**: `{timestamp}_{randomId}_{index}.{extension}`
- **Uniqueness**: Timestamp + random string ensures no conflicts
- **Organization**: Index maintains upload order

## **Setup Instructions**

### **1. Database Migration**

```bash
npm run migrate:images
```

### **2. Supabase Storage Setup**

Follow the detailed guide in `SUPABASE_STORAGE_SETUP.md`:

- Create `item-images` bucket
- Configure RLS policies
- Enable public access

### **3. Environment Variables**

Ensure these are set in your `.env` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_STORAGE_BUCKET=barter_user_item_media
```

## **Usage Examples**

### **Adding Images to Item**

```typescript
// In AddToy component
const [images, setImages] = useState<File[]>([]);
const [imagePreviews, setImagePreviews] = useState<string[]>([]);

const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  // Validation and preview generation
};
```

### **Displaying Multiple Images**

```typescript
// In EnhancedItemCard component
{
  item.imageUrls && item.imageUrls.length > 0 ? (
    <>
      <img src={item.imageUrls[0]} alt={item.title} />
      {item.imageUrls.length > 1 && <div className="multiple-images-indicator">+{item.imageUrls.length - 1} more</div>}
    </>
  ) : (
    <div className="no-image-placeholder" />
  );
}
```

## **Error Handling**

### **Upload Failures**

- **File validation errors**: Clear user feedback
- **Storage errors**: Graceful fallback, item created without images
- **Network errors**: Retry mechanisms and user notifications

### **Display Fallbacks**

- **Missing images**: Placeholder backgrounds
- **Broken URLs**: Error handling with fallback UI
- **Loading states**: Smooth transitions and feedback

## **Performance Considerations**

### **Image Optimization**

- **Client-side compression**: Reduce file sizes before upload
- **Lazy loading**: Images load as needed
- **CDN delivery**: Supabase Storage provides global CDN

### **Storage Efficiency**

- **File size limits**: 5MB per image prevents abuse
- **Format support**: Modern formats (WebP) for better compression
- **Cleanup**: Automatic cleanup of orphaned files

## **Security Features**

### **Access Control**

- **Authentication required**: Only logged-in users can upload
- **User isolation**: Users can only access their own images
- **Public read access**: Images viewable by all users (required for app)

### **File Validation**

- **Type checking**: Only image files allowed
- **Size limits**: Prevents abuse and storage bloat
- **Content validation**: Server-side validation in storage policies

## **Testing**

### **Manual Testing**

1. **Image selection**: Test multiple file selection
2. **Validation**: Test file size and type restrictions
3. **Upload flow**: Complete item creation with images
4. **Display**: Verify images show correctly in item cards

### **Edge Cases**

- **No images**: Item creation without images
- **Large files**: Test size limit enforcement
- **Invalid types**: Test file type validation
- **Network issues**: Test upload failure handling

## **Monitoring & Maintenance**

### **Storage Usage**

- **Monitor quotas**: Track storage usage in Supabase dashboard
- **Cleanup scripts**: Remove orphaned files periodically
- **Performance metrics**: Monitor upload/download speeds

### **Error Tracking**

- **Upload failures**: Log and alert on storage errors
- **User feedback**: Track common issues and user complaints
- **Performance issues**: Monitor for slow uploads or display issues

## **Future Enhancements**

### **Image Processing**

- **Automatic resizing**: Generate thumbnails and optimized versions
- **Format conversion**: Convert to WebP for better compression
- **Watermarking**: Add user watermarks to images

### **Advanced Features**

- **Image reordering**: Drag & drop to reorder images
- **Bulk operations**: Select multiple images for deletion
- **Image editing**: Basic crop and filter options

### **Performance Improvements**

- **Progressive loading**: Load images progressively
- **Caching strategies**: Implement client-side image caching
- **Compression**: Client-side image compression before upload

## **Troubleshooting**

### **Common Issues**

1. **"Bucket does not exist"**: Check Supabase Storage setup
2. **"Access denied"**: Verify RLS policies
3. **Images not displaying**: Check bucket public access
4. **Upload failures**: Verify file size and type

### **Debug Steps**

1. Check browser console for errors
2. Verify Supabase Storage configuration
3. Check database migration status
4. Test with simple image files

## **Support**

For issues or questions:

1. Check this documentation
2. Review `SUPABASE_STORAGE_SETUP.md`
3. Check browser console and network tab
4. Verify all setup steps completed correctly

---

**Implementation Status**: ✅ Complete  
**Last Updated**: January 2025  
**Version**: 1.0.0
