import React, { useEffect, useState } from "react";
import { X, Camera } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useItems } from "../hooks/useItems";
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import toast from "react-hot-toast";
import { ServiceResult, ItemData } from "../services/types";
import { trackEvent } from "../lib/analytics";

export const AddToy: React.FC = () => {
  const { itemId } = useParams<{ itemId?: string }>();
  const isEditMode = Boolean(itemId);

  // PRD §17 item-listing funnel, step 1: Add-listing form opened. Create
  // mode only -- this funnel is specifically about publishing a new listing,
  // not editing an existing one.
  useEffect(() => {
    if (!isEditMode) {
      trackEvent("add_listing_form_opened");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [categorySuggestion, setCategorySuggestion] = useState("");
  const [condition, setCondition] = useState("");
  const [images, setImages] = useState<File[]>([]); // Newly-picked files this session only
  const [imagePreviews, setImagePreviews] = useState<string[]>([]); // Base64 previews of `images`, same order
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]); // Pre-existing storage URLs, edit mode only
  const [estimatedValue, setEstimatedValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const { createItem, updateItem, getItem } = useItems();
  const navigate = useNavigate();

  // Always called, per Rules of Hooks -- enabled: !!itemId inside the hook
  // itself means this is a no-op query in create mode.
  const existingItemQuery = getItem(itemId ?? "");
  const existingItem = existingItemQuery.data?.data;
  const existingItemLoadError = existingItemQuery.data?.error;

  useEffect(() => {
    if (!isEditMode || !existingItem || prefilled) return;

    setTitle(existingItem.title ?? "");
    setDescription(existingItem.description ?? "");
    setCategory(existingItem.category ?? "");
    setCategorySuggestion(existingItem.categorySuggestion ?? "");
    setCondition(existingItem.condition ?? "");
    setExistingImageUrls(existingItem.imageUrls ?? []);
    setEstimatedValue(
      existingItem.estimatedValue === null || existingItem.estimatedValue === undefined
        ? ""
        : String(existingItem.estimatedValue)
    );
    setPrefilled(true);
  }, [isEditMode, existingItem, prefilled]);

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

    const remainingSlots = 10 - existingImageUrls.length - images.length;
    if (validFiles.length > remainingSlots) {
      toast.error(
        remainingSlots <= 0
          ? "Maximum 10 images allowed"
          : `You can add up to ${remainingSlots} more photo${remainingSlots === 1 ? "" : "s"}`
      );
      return;
    }

    // Appends to the existing selection rather than replacing it -- this is now
    // reachable repeatedly via the persistent "Add more" tile once there's at
    // least one photo, not just once from the initial empty-state picker.
    setImages((prev) => [...prev, ...validFiles]);

    // PRD §17 item-listing funnel, step 2: photo uploaded. Create mode only,
    // and only when something valid was actually added (not on a picker
    // cancel or an all-rejected batch).
    if (!isEditMode && validFiles.length > 0) {
      trackEvent("listing_photo_uploaded");
    }

    // Generate previews
    const previews = validFiles.map((file) => {
      const reader = new FileReader();
      return new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(previews).then((newPreviews) => setImagePreviews((prev) => [...prev, ...newPreviews]));

    // Without this, re-selecting the same file a second time wouldn't fire onChange
    // again, since this input now stays mounted across multiple picks instead of
    // being remounted by the old empty-state/grid conditional swap.
    e.target.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingImage = (index: number) => {
    setExistingImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate that at least one image is selected, across existing + new
      if (existingImageUrls.length + images.length === 0) {
        toast.error("Please select at least one image");
        setLoading(false);
        return;
      }

      // PRD §17 item-listing funnel, step 3: required fields completed.
      // title/category/condition are already enforced by the form's native
      // HTML `required` attributes (the browser blocks onSubmit from firing
      // at all otherwise), so by this point -- past the one field that
      // isn't declaratively validated (at least one image) -- every
      // required field is confirmed present. Create mode only.
      if (!isEditMode) {
        trackEvent("listing_required_fields_completed");
      }

      // estimated_value is entirely optional and defaults to 0 (PRD §2) -- an
      // empty field means "no value entered," not "free," so it submits as 0
      // rather than requiring the person to pick between a Free/Set-Value toggle.
      const finalEstimatedValue = estimatedValue.trim() === "" ? 0 : parseFloat(estimatedValue);

      // Only carries a category suggestion when Other is actually selected, so a
      // suggestion typed in earlier doesn't linger after switching to a different category.
      const finalCategorySuggestion = category === "Other" ? categorySuggestion || undefined : undefined;

      // existingImageUrls (already-real storage URLs, edit mode only) + imagePreviews
      // (base64 previews of newly-picked files). itemService.updateItem separates
      // which of these need uploading; in create mode existingImageUrls is always empty.
      const combinedImageUrls = [...existingImageUrls, ...imagePreviews];

      if (isEditMode && itemId) {
        const result = (await updateItem({
          itemId,
          updates: {
            title,
            description,
            category,
            condition,
            imageUrls: combinedImageUrls,
            estimatedValue: finalEstimatedValue,
            valueCurrency: "USD",
            categorySuggestion: finalCategorySuggestion,
          },
        })) as ServiceResult<ItemData>;

        if (result.error) {
          toast.error(result.error.message);
        } else {
          toast.success("Listing updated!");
          navigate("/my-stuff", { state: { highlightItemId: itemId } });
        }
      } else {
        const result = (await createItem({
          title,
          description,
          category,
          condition,
          imageUrls: combinedImageUrls, // Pass base64 previews - service will convert to files
          isActive: true,
          estimatedValue: finalEstimatedValue,
          valueCurrency: "USD",
          sourceUrl: null,
          categorySuggestion: finalCategorySuggestion,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as ServiceResult<ItemData>;

        if (result.error) {
          toast.error(result.error.message);
        } else {
          toast.success("Item added successfully!");
          // PRD §17 item-listing funnel, step 4 (final): listing published.
          trackEvent("listing_published", { itemId: result.data?.id });
          navigate("/my-stuff", { state: { highlightItemId: result.data?.id } });
        }
      }
    } catch (error) {
      console.error(`Failed to ${isEditMode ? "update" : "add"} item:`, error);
      toast.error(`Failed to ${isEditMode ? "update" : "add"} item. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  if (isEditMode && existingItemQuery.isLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (isEditMode && existingItemLoadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center text-gray-600">
        Couldn't load this listing. It may have been removed.
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{isEditMode ? "Edit Listing" : "Add New Item"}</h1>
        <p className="text-gray-600">
          {isEditMode ? "Update your item's details" : "Share an item you'd like to exchange"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Photos (Up to 10 images)</label>
          <div className="relative">
            {existingImageUrls.length > 0 || imagePreviews.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {existingImageUrls.map((url, index) => (
                  <div key={`existing-${index}`} className="relative">
                    <img src={url} alt={`Photo ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => handleRemoveExistingImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {imagePreviews.map((preview, index) => (
                  <div key={`new-${index}`} className="relative">
                    <img src={preview} alt={`New photo ${index + 1}`} className="w-full h-24 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {existingImageUrls.length + imagePreviews.length < 10 && (
                  <label className="flex flex-col items-center justify-center h-24 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <Camera className="w-5 h-5 mb-1 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500">Add more</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} multiple />
                  </label>
                )}
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
          {category === "Other" && (
            <div className="mt-3">
              <label htmlFor="categorySuggestion" className="block text-sm font-medium text-gray-700 mb-2">
                Suggest a category name (optional)
              </label>
              <input
                id="categorySuggestion"
                type="text"
                value={categorySuggestion}
                onChange={(e) => setCategorySuggestion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g. Board Games"
              />
              <p className="text-xs text-gray-500 mt-1">Your listing will show under Other for now.</p>
            </div>
          )}
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

        {/* Item Value */}
        <div>
          <label htmlFor="estimatedValue" className="block text-sm font-medium text-gray-700 mb-2">
            Estimated value (optional)
          </label>
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
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Help others understand your item's value for fair trades. Leave blank if you're not sure.</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-lg font-medium hover:from-pink-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <LoadingSpinner /> : isEditMode ? "Save changes" : "Add Item"}
        </button>
      </form>
    </div>
  );
};
