import React, { useState } from "react";
import { motion } from "framer-motion";
import { Upload, X, Plus, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useItems } from "../hooks/useItems";
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import toast from "react-hot-toast";
import { ServiceResult, ItemData } from "../services/types";

export const AddToy: React.FC = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [images, setImages] = useState<File[]>([]); // ✅ Changed from single image to array
  const [imagePreviews, setImagePreviews] = useState<string[]>([]); // ✅ Changed from single preview to array
  const [estimatedValue, setEstimatedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFreeItem, setIsFreeItem] = useState(false); // ✅ New state for free toggle

  const { createItem } = useItems();
  const navigate = useNavigate();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // Validate files
    const validFiles = files.filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        toast.error(`${file.name} is too large. Must be less than 5MB`);
        return false;
      }

      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }

      return true;
    });

    if (validFiles.length > 10) {
      toast.error("Maximum 10 images allowed");
      return;
    }

    setImages(validFiles);

    // Generate previews
    const previews = validFiles.map((file) => {
      const reader = new FileReader();
      return new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(previews).then(setImagePreviews);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags((prev) => [...prev, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate that at least one image is selected
      if (images.length === 0) {
        toast.error("Please select at least one image");
        setLoading(false);
        return;
      }

      const result = (await createItem({
        title,
        description,
        category,
        condition,
        tags,
        imageUrls: imagePreviews, // Pass base64 previews - service will convert to files
        isActive: true,
        estimatedValue: isFreeItem ? null : parseFloat(estimatedValue),
        valueCurrency: "USD",
        sourceUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as ServiceResult<ItemData>;

      if (result.error) {
        toast.error(result.error.message);
      } else {
        toast.success("Item added successfully!");
        navigate("/profile");
      }
    } catch (error) {
      console.error("Failed to add item:", error);
      toast.error("Failed to add item. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Add New Item</h1>
        <p className="text-gray-600">Share an item you'd like to exchange</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Photos (Up to 10 images)</label>
          <div className="relative">
            {imagePreviews.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative">
                    <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Camera className="w-8 h-8 mb-4 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB each (max 10 images)</p>
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} multiple />
              </label>
            )}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Title *
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Enter item title"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Describe your item..."
          />
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
            Category *
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
          >
            <option value="">Select a category</option>
            {ITEM_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Condition */}
        <div>
          <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-2">
            Condition *
          </label>
          <select
            id="condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            required
          >
            <option value="">Select condition</option>
            {ITEM_CONDITIONS.map((cond) => (
              <option key={cond} value={cond}>
                {cond}
              </option>
            ))}
          </select>
        </div>

        {/* Item Value Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Item Value
          </label>
          
          {/* Free Item Toggle */}
          <div className="flex items-center space-x-3 mb-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="itemValue"
                checked={isFreeItem}
                onChange={() => setIsFreeItem(true)}
                className="sr-only"
              />
              <div className={`w-5 h-5 border-2 rounded-full mr-2 flex items-center justify-center ${
                isFreeItem 
                  ? 'border-purple-500 bg-purple-500' 
                  : 'border-gray-300'
              }`}>
                {isFreeItem && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
              <span className={`font-medium ${isFreeItem ? 'text-purple-700' : 'text-gray-700'}`}>
                Free Item
              </span>
            </label>
            
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="itemValue"
                checked={!isFreeItem}
                onChange={() => setIsFreeItem(false)}
                className="sr-only"
              />
              <div className={`w-5 h-5 border-2 rounded-full mr-2 flex items-center justify-center ${
                !isFreeItem 
                  ? 'border-purple-500 bg-purple-500' 
                  : 'border-gray-300'
              }`}>
                {!isFreeItem && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
              <span className={`font-medium ${!isFreeItem ? 'text-purple-700' : 'text-gray-700'}`}>
                Set Value
              </span>
            </label>
          </div>

          {/* Value Input - Only show when not free */}
          {!isFreeItem && (
            <div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  id="estimatedValue"
                  type="number"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Help others understand your item's value for fair trades</p>
            </div>
          )}

          {/* Free Item Indicator */}
          {isFreeItem && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold text-lg">$</span>
                </div>
                <div>
                  <p className="font-medium text-green-800">Free Item</p>
                  <p className="text-sm text-green-600">This item is available for free exchange</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
          <div className="flex space-x-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Add a tag"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-700"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-2 text-purple-500 hover:text-purple-700"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg font-medium hover:from-pink-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <LoadingSpinner /> : "Add Item"}
        </button>
      </form>
    </div>
  );
};
