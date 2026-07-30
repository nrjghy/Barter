import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";

export interface StorageService {
  uploadImages: (files: File[], userId: string, itemId: string) => Promise<string[]>;
  uploadMessageImage: (file: File, userId: string, connectionId: string) => Promise<string>;
  deleteImage: (imageUrl: string) => Promise<boolean>;
  deleteImages: (imageUrls: string[]) => Promise<boolean>;
}

class StorageServiceImpl implements StorageService {
  private readonly BUCKET_NAME = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "barter_user_item_media";
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

  constructor() {
    // Validate that bucket name is configured
    if (!this.BUCKET_NAME) {
      console.error("VITE_SUPABASE_STORAGE_BUCKET environment variable is not set");
      throw new Error("Storage bucket name not configured");
    }
  }

  /**
   * Upload multiple images to Supabase Storage
   * @param files - Array of image files to upload
   * @param userId - User ID for organizing storage
   * @param itemId - Item ID for organizing storage
   * @returns Promise<string[]> - Array of uploaded image URLs
   */
  async uploadImages(files: File[], userId: string, itemId: string): Promise<string[]> {
    try {
      // Validate files
      const validFiles = this.validateFiles(files);
      if (validFiles.length === 0) {
        throw new Error("No valid files to upload");
      }

      // Bucket validation is handled by the upload operation itself

      const uploadPromises = validFiles.map(async (file, index) => {
        const fileName = this.generateFileName(file, userId, itemId, index);
        const filePath = `${userId}/${itemId}/${fileName}`;

        const { data, error } = await supabase.storage.from(this.BUCKET_NAME).upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

        if (error) {
          console.error(`Failed to upload ${file.name}:`, error);
          throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from(this.BUCKET_NAME).getPublicUrl(filePath);

        return urlData.publicUrl;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      toast.success(`Successfully uploaded ${uploadedUrls.length} images`);

      return uploadedUrls;
    } catch (error) {
      console.error("Image upload failed:", error);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  /**
   * Upload a single chat message photo to Supabase Storage.
   *
   * Separate from uploadImages because that method's path shape
   * (${userId}/${itemId}/...) is item-specific -- a chat message belongs
   * to a connection, not an item, so this uses its own path
   * (${userId}/messages/${connectionId}/...) rather than repurposing the
   * itemId slot for something it doesn't mean.
   * @param file - Image file to upload
   * @param userId - User ID for organizing storage
   * @param connectionId - Connection ID for organizing storage
   * @returns Promise<string> - Uploaded image's public URL
   */
  async uploadMessageImage(file: File, userId: string, connectionId: string): Promise<string> {
    try {
      const validFiles = this.validateFiles([file]);
      if (validFiles.length === 0) {
        throw new Error("No valid file to upload");
      }

      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const extension = file.name.split(".").pop() || "jpg";
      const fileName = `${timestamp}_${randomId}.${extension}`;
      const filePath = `${userId}/messages/${connectionId}/${fileName}`;

      const { error } = await supabase.storage.from(this.BUCKET_NAME).upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        throw new Error(`Failed to upload ${file.name}: ${error.message}`);
      }

      const { data: urlData } = supabase.storage.from(this.BUCKET_NAME).getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch (error) {
      console.error("Message image upload failed:", error);
      toast.error(`Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  /**
   * Delete a single image from storage
   * @param imageUrl - Full URL of the image to delete
   * @returns Promise<boolean> - Success status
   */
  async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      const filePath = this.extractFilePathFromUrl(imageUrl);
      if (!filePath) {
        throw new Error("Invalid image URL");
      }

      const { error } = await supabase.storage.from(this.BUCKET_NAME).remove([filePath]);

      if (error) {
        console.error("Failed to delete image:", error);
        throw new Error(`Failed to delete image: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("Image deletion failed:", error);
      toast.error(`Failed to delete image: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  /**
   * Delete multiple images from storage
   * @param imageUrls - Array of image URLs to delete
   * @returns Promise<boolean> - Success status
   */
  async deleteImages(imageUrls: string[]): Promise<boolean> {
    try {
      const filePaths = imageUrls
        .map((url) => this.extractFilePathFromUrl(url))
        .filter((path) => path !== null) as string[];

      if (filePaths.length === 0) {
        return true;
      }

      const { error } = await supabase.storage.from(this.BUCKET_NAME).remove(filePaths);

      if (error) {
        console.error("Failed to delete images:", error);
        throw new Error(`Failed to delete images: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error("Bulk image deletion failed:", error);
      toast.error(`Failed to delete images: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }

  /**
   * Validate uploaded files
   * @param files - Array of files to validate
   * @returns File[] - Array of valid files
   */
  private validateFiles(files: File[]): File[] {
    return files.filter((file) => {
      if (file.size > this.MAX_FILE_SIZE) {
        toast.error(`${file.name} is too large. Must be less than 5MB`);
        return false;
      }

      if (!this.ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name} is not a supported image type`);
        return false;
      }

      return true;
    });
  }

  /**
   * Generate unique filename for storage
   * @param file - File to generate name for
   * @param userId - User ID
   * @param itemId - Item ID
   * @param index - File index
   * @returns string - Generated filename
   */
  private generateFileName(file: File, userId: string, itemId: string, index: number): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split(".").pop() || "jpg";

    return `${timestamp}_${randomId}_${index}.${extension}`;
  }

  /**
   * Extract file path from public URL
   * @param imageUrl - Full image URL
   * @returns string | null - File path or null if invalid
   */
  private extractFilePathFromUrl(imageUrl: string): string | null {
    try {
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split("/");
      const bucketIndex = pathParts.findIndex((part) => part === this.BUCKET_NAME);

      if (bucketIndex === -1) {
        return null;
      }

      return pathParts.slice(bucketIndex + 1).join("/");
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const storageService = new StorageServiceImpl();
