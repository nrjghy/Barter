import React, { useEffect, useRef, useState } from "react";
import { X, Camera, Star, MapPin, Navigation } from "lucide-react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { useItems } from "../hooks/useItems";
import { useAuth } from "../contexts/AuthContext";
import { useUserGroups, useItemGroupIds, useLastSelectedGroupIds } from "../hooks/useGroups";
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from "../types";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { InfoTooltip } from "../components/InfoTooltip";
import toast from "react-hot-toast";
import { ServiceResult, ItemData } from "../services/types";
import { GroupService } from "../services/groupService";
import { GROUPS_ENABLED } from "../services/config";
import { trackEvent } from "../lib/analytics";
import { supabase } from "../lib/supabase";

// PRD §2 required fields, in on-screen order -- used both to decide which
// fields need a touched/error state and, on a failed Save, to find the
// first invalid one to scroll to.
type RequiredField = "photos" | "title" | "category" | "condition";
const REQUIRED_FIELD_ORDER: RequiredField[] = ["photos", "title", "category", "condition"];

// Curated dropdown list -- the currency field has no algorithmic use per the
// PRD, so this intentionally isn't the full ~150-entry ISO 4217 list.
const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CZK", "HUF", "RON", "SEK", "NOK", "DKK", "CHF", "UAH"];

// Single ordered source of truth for the photo picker -- position 0 is the
// listing's primary photo. Existing (already-uploaded) and newly-picked
// photos are interchangeable entries in the same array so reordering works
// across both without a separate merge step at submit time.
type PhotoItem = { type: "existing"; url: string } | { type: "new"; file: File; preview: string };

// PRD §11's 5MB-per-photo cap is purely this app's own rule -- Storage has
// no server-side size limit on this bucket (file_size_limit: null on
// barter_user_item_media).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Client-side downscale + re-encode for oversized photos. Exists because iOS
// Safari transcodes HEIC photos to JPEG at pick time, and JPEG compresses
// worse than HEIF at equivalent visual quality, so a photo that's well under
// 5MB in the Photos app can arrive here as a 5MB+ JPEG. Returns null only if
// it's still over the cap after every dimension/quality round -- callers
// should fall back to rejecting the file, same as before this existed.
async function compressImageFile(file: File): Promise<File | null> {
  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return null;
  }

  const qualitySteps: number[] = [];
  for (let q = 0.92; q > 0.6; q -= 0.1) {
    qualitySteps.push(Math.round(q * 100) / 100);
  }
  qualitySteps.push(0.6);

  let maxDimension = 2048;
  for (let round = 0; round < 3; round++) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);

    for (const quality of qualitySteps) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        return blobToJpegFile(blob, file.name);
      }
    }

    maxDimension = Math.round(maxDimension * 0.8); // ~20% smaller each round
  }

  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

function blobToJpegFile(blob: Blob, originalName: string): File {
  const name = /\.jpe?g$/i.test(originalName) ? originalName : originalName.replace(/\.[^./\\]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}

export const AddEditItem: React.FC = () => {
  const { itemId } = useParams<{ itemId?: string }>();
  const isEditMode = Boolean(itemId);
  const location = useLocation();
  const relistFrom = (location.state as { relistFrom?: ItemData } | null)?.relistFrom;

  // PRD §17 item-listing funnel, step 1: Add-listing form opened. Create
  // mode only -- this funnel is specifically about publishing a new listing,
  // not editing an existing one.
  useEffect(() => {
    if (!isEditMode) {
      trackEvent("add_listing_form_opened");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [categorySuggestion, setCategorySuggestion] = useState("");
  const [condition, setCondition] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]); // Ordered photo list, position 0 is primary
  const [estimatedValue, setEstimatedValue] = useState("");
  const [currency, setCurrency] = useState(user?.defaultCurrency ?? "PLN");
  const [listingType, setListingType] = useState<"trade" | "giveaway">("trade");
  const [sourceUrl, setSourceUrl] = useState("");
  // Defaults to the owner's profile location; editable below via the same
  // places-autocomplete pattern as Profile.tsx, so a listing can be pinned
  // somewhere other than the owner's own address.
  const [itemLocation, setItemLocation] = useState(user?.location ?? "");
  const [itemLatitude, setItemLatitude] = useState<number | null>(user?.latitude ?? null);
  const [itemLongitude, setItemLongitude] = useState<number | null>(user?.longitude ?? null);
  const [itemLocationLoading, setItemLocationLoading] = useState(false);
  const [itemLocationSuggestions, setItemLocationSuggestions] = useState<
    { label: string; lat: number; lng: number }[]
  >([]);
  const [showItemLocationDropdown, setShowItemLocationDropdown] = useState(false);
  const itemLocationSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Visibility: Public listing toggle + which of the owner's groups this
  // item is shared to. New items default to public/no groups; edit mode
  // prefills the group checklist from item_groups once it loads.
  const [isPublic, setIsPublic] = useState(true);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupsPrefilled, setGroupsPrefilled] = useState(false);
  // All three take an `enabled` flag rather than being called conditionally,
  // so this respects the rules of hooks while making no network calls
  // against Barter2 (which doesn't have the Groups schema deployed) when
  // GROUPS_ENABLED is false.
  const { groups: userGroups, loading: userGroupsLoading } = useUserGroups(GROUPS_ENABLED);
  const { groupIds: existingItemGroupIds, loading: itemGroupsLoading } = useItemGroupIds(
    GROUPS_ENABLED && isEditMode ? itemId : undefined
  );
  const { groupIds: lastSelectedGroupIds, loading: lastSelectedGroupsLoading } = useLastSelectedGroupIds(
    GROUPS_ENABLED && !isEditMode
  );

  // Required-field inline validation (PRD §13): each required field tracks
  // its own touched state, so an error only surfaces once the person has
  // actually interacted with that field, not on initial render.
  const [touched, setTouched] = useState<Record<RequiredField, boolean>>({
    photos: false,
    title: false,
    category: false,
    condition: false,
  });
  // Set once Save is attempted while a required field is still invalid --
  // from that point on, every required field shows its error state
  // regardless of individual touched status, matching the approved mockup.
  const [saveAttempted, setSaveAttempted] = useState(false);

  const photosRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const conditionRef = useRef<HTMLDivElement>(null);

  const { createItem, updateItem, getItem, cancelItem, cancelItemLoading } = useItems();
  const navigate = useNavigate();

  const fieldErrors: Record<RequiredField, boolean> = {
    photos: photos.length === 0,
    title: !title.trim(),
    category: !category,
    condition: !condition,
  };
  const invalidFields = REQUIRED_FIELD_ORDER.filter((field) => fieldErrors[field]);

  const markTouched = (field: RequiredField) => setTouched((prev) => ({ ...prev, [field]: true }));
  const showError = (field: RequiredField) => (touched[field] || saveAttempted) && fieldErrors[field];

  const fieldRefs: Record<RequiredField, React.RefObject<HTMLDivElement>> = {
    photos: photosRef,
    title: titleRef,
    category: categoryRef,
    condition: conditionRef,
  };

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
    setListingType(existingItem.listingType ?? "trade");
    setPhotos((existingItem.imageUrls ?? []).map((url) => ({ type: "existing", url })));
    setEstimatedValue(
      existingItem.estimatedValue === null || existingItem.estimatedValue === undefined
        ? ""
        : String(existingItem.estimatedValue)
    );
    setCurrency(existingItem.valueCurrency ?? "PLN");
    setSourceUrl(existingItem.sourceUrl ?? "");
    setItemLocation(existingItem.location ?? "");
    setItemLatitude(existingItem.latitude ?? null);
    setItemLongitude(existingItem.longitude ?? null);
    setIsPublic(existingItem.isPublic ?? true);
    setPrefilled(true);
  }, [isEditMode, existingItem, prefilled]);

  // Share checklist prefill: waits for the item_groups fetch to actually
  // resolve (rather than keying off array length) since an empty result --
  // shared to none of the caller's groups -- is a valid, distinct state.
  useEffect(() => {
    if (!isEditMode || groupsPrefilled || itemGroupsLoading || !existingItem) return;
    setSelectedGroupIds(existingItemGroupIds);
    setGroupsPrefilled(true);
  }, [isEditMode, existingItem, existingItemGroupIds, itemGroupsLoading, groupsPrefilled]);

  // Share checklist prefill, create mode: pre-checks whatever groups were
  // checked on the person's last published listing, filtered against the
  // groups the checklist is already showing so a stale id left over from a
  // since-deleted group is silently dropped rather than needing cleanup.
  useEffect(() => {
    if (isEditMode || groupsPrefilled || lastSelectedGroupsLoading || userGroupsLoading) return;
    const userGroupIdSet = new Set(userGroups.map((group) => group.id));
    setSelectedGroupIds(lastSelectedGroupIds.filter((id) => userGroupIdSet.has(id)));
    setGroupsPrefilled(true);
  }, [isEditMode, lastSelectedGroupIds, lastSelectedGroupsLoading, userGroups, userGroupsLoading, groupsPrefilled]);

  // Relist (PRD §4): MyStuff navigates here with relistFrom in location.state
  // for a Cancelled/Traded/Expired item. This pre-fills a brand-new listing --
  // the original item is never touched, and unlike edit mode, listingType
  // stays freely editable here (a relisted item has zero existing
  // connections yet, so there's no correctness risk in changing it).
  useEffect(() => {
    if (isEditMode || !relistFrom || prefilled) return;

    setTitle(relistFrom.title ?? "");
    setDescription(relistFrom.description ?? "");
    setCategory(relistFrom.category ?? "");
    setCategorySuggestion(relistFrom.categorySuggestion ?? "");
    setCondition(relistFrom.condition ?? "");
    setListingType(relistFrom.listingType ?? "trade");
    setPhotos((relistFrom.imageUrls ?? []).map((url) => ({ type: "existing", url })));
    setEstimatedValue(
      relistFrom.estimatedValue === null || relistFrom.estimatedValue === undefined
        ? ""
        : String(relistFrom.estimatedValue)
    );
    setCurrency(relistFrom.valueCurrency ?? "PLN");
    setSourceUrl(relistFrom.sourceUrl ?? "");
    setItemLocation(relistFrom.location ?? "");
    setItemLatitude(relistFrom.latitude ?? null);
    setItemLongitude(relistFrom.longitude ?? null);
    setPrefilled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, relistFrom, prefilled]);

  const getCurrentItemLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }

    setItemLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke("reverse-geocode", {
            body: { lat: latitude, lng: longitude },
          });
          const locationString =
            geocodeError || !geocodeData?.location ? "Unknown location" : geocodeData.location;

          setItemLocation(locationString);
          setItemLatitude(latitude);
          setItemLongitude(longitude);
        } catch (error) {
          console.error("Unexpected location update error:", error);
          toast.error("Failed to get location");
        } finally {
          setItemLocationLoading(false);
        }
      },
      () => {
        toast.error("Failed to get current location");
        setItemLocationLoading(false);
      }
    );
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // Validate files
    const validFiles = files.filter((file) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        // Canvas re-encoding only captures a single frame, which would
        // silently strip an animated GIF's animation -- oversized GIFs keep
        // the original hard reject instead of going through compression.
        if (file.type === "image/gif") {
          toast.error(`${file.name} is too large. Must be less than 5MB`);
          return false;
        }
        // Anything else still counts as valid here (occupying a slot below)
        // and gets a shot at client-side compression once that check passes;
        // genuinely uncompressible files are caught and rejected individually
        // after that finishes.
      }

      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }

      return true;
    });

    const remainingSlots = 10 - photos.length;
    if (validFiles.length > remainingSlots) {
      toast.error(
        remainingSlots <= 0
          ? "Maximum 10 images allowed"
          : `You can add up to ${remainingSlots} more photo${remainingSlots === 1 ? "" : "s"}`
      );
      return;
    }

    // PRD §17 item-listing funnel, step 2: photo uploaded. Create mode only,
    // and only when something valid was actually added (not on a picker
    // cancel or an all-rejected batch).
    if (!isEditMode && validFiles.length > 0) {
      trackEvent("listing_photo_uploaded");
    }

    // Files already under the cap pass through untouched -- only oversized
    // (non-GIF) files get downscaled/re-encoded.
    Promise.all(
      validFiles.map((file) =>
        file.size > MAX_UPLOAD_BYTES ? compressImageFile(file).catch(() => null) : Promise.resolve<File | null>(file)
      )
    ).then((results) => {
      const finalFiles: File[] = [];
      results.forEach((result, i) => {
        if (result) {
          finalFiles.push(result);
        } else {
          toast.error(`${validFiles[i].name} is too large. Must be less than 5MB`);
        }
      });
      if (finalFiles.length === 0) return;

      // Generate previews, then append -- this is now reachable repeatedly via
      // the persistent "Add more" tile once there's at least one photo, not
      // just once from the initial empty-state picker.
      const previews = finalFiles.map((file) => {
        const reader = new FileReader();
        return new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });

      Promise.all(previews).then((newPreviews) => {
        const newPhotos: PhotoItem[] = finalFiles.map((file, i) => ({
          type: "new",
          file,
          preview: newPreviews[i],
        }));
        setPhotos((prev) => [...prev, ...newPhotos]);
      });
    });

    // Without this, re-selecting the same file a second time wouldn't fire onChange
    // again, since this input now stays mounted across multiple picks instead of
    // being remounted by the old empty-state/grid conditional swap.
    e.target.value = "";
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetPrimaryPhoto = (index: number) => {
    setPhotos((prev) => {
      if (index === 0) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      return next;
    });
  };

  const handleConfirmCancel = async () => {
    if (!itemId) return;
    try {
      await cancelItem(itemId);
      navigate("/my-stuff");
    } finally {
      setConfirmingCancel(false);
    }
  };

  // Best-effort, same pattern as the cancel-item notification in
  // itemService.cancelItem: the item itself is already saved by this point,
  // so a failure here shouldn't be surfaced as if the whole save failed --
  // it would just mean the group-visibility change didn't stick.
  const saveItemGroups = async (savedItemId: string) => {
    try {
      const result = await GroupService.setItemGroups(savedItemId, selectedGroupIds);
      if (result.error) {
        toast.error(`Listing saved, but group sharing didn't update: ${result.error.message}`);
      }
    } catch {
      toast.error("Listing saved, but group sharing didn't update.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditMode && itemLatitude == null && user?.latitude == null) {
      toast.error("Add your location before creating a listing");
      return;
    }

    // Defensive only -- the Public toggle and group checklist onChange
    // handlers already keep this combination unreachable through normal
    // interaction. This guards edit mode against an existing item whose
    // stored data predates that constraint.
    if (GROUPS_ENABLED && !isPublic && selectedGroupIds.length === 0) {
      toast.error("Make this listing public or share it to at least one group.");
      return;
    }

    // PRD §13: a failed Save attempt marks every required field touched
    // (so all their errors show, not just the ones already blurred) and
    // shows the summary banner, then scrolls to the first invalid field in
    // on-screen order.
    if (invalidFields.length > 0) {
      setSaveAttempted(true);
      setTouched({ photos: true, title: true, category: true, condition: true });
      fieldRefs[invalidFields[0]].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setLoading(true);

    try {
      // PRD §17 item-listing funnel, step 3: required fields completed.
      // Create mode only.
      if (!isEditMode) {
        trackEvent("listing_required_fields_completed");
      }

      // estimated_value is entirely optional and defaults to 0 (PRD §2) -- an
      // empty field means "no value entered," not "free," so it submits as 0
      // rather than requiring the person to pick between a Free/Set-Value toggle.
      // Giveaways force this to 0 outright, matching the backend's own
      // min/max-value-filter exemption for listing_type = 'giveaway'.
      const finalEstimatedValue =
        listingType === "giveaway" ? 0 : estimatedValue.trim() === "" ? 0 : parseFloat(estimatedValue);

      // Only carries a category suggestion when Other is actually selected, so a
      // suggestion typed in earlier doesn't linger after switching to a different category.
      const finalCategorySuggestion = category === "Other" ? categorySuggestion || undefined : undefined;

      // Existing storage URLs and base64 previews of newly-picked files, in the
      // order set by the picker (position 0 is primary). itemService.updateItem
      // separates which of these need uploading; in create mode every entry is "new".
      const combinedImageUrls = photos.map((photo) => (photo.type === "existing" ? photo.url : photo.preview));

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
            valueCurrency: currency,
            sourceUrl: sourceUrl.trim() || null,
            categorySuggestion: finalCategorySuggestion,
            location: itemLocation.trim() || undefined,
            latitude: itemLatitude,
            longitude: itemLongitude,
            isPublic,
          },
        })) as ServiceResult<ItemData>;

        if (result.error) {
          toast.error(result.error.message);
        } else {
          if (GROUPS_ENABLED) await saveItemGroups(itemId);
          toast.success("Listing updated!");
          navigate("/my-stuff", { state: { highlightItemId: itemId } });
        }
      } else {
        const result = (await createItem({
          title,
          description,
          category,
          condition,
          listingType,
          imageUrls: combinedImageUrls, // Pass base64 previews - service will convert to files
          isActive: true,
          estimatedValue: finalEstimatedValue,
          valueCurrency: currency,
          sourceUrl: sourceUrl.trim() || null,
          categorySuggestion: finalCategorySuggestion,
          location: itemLocation.trim() || undefined,
          latitude: itemLatitude,
          longitude: itemLongitude,
          isPublic,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as ServiceResult<ItemData>;

        if (result.error) {
          toast.error(result.error.message);
        } else {
          if (GROUPS_ENABLED && result.data?.id) await saveItemGroups(result.data.id);
          // Best-effort, same as saveItemGroups -- the listing itself is
          // already published by this point, so a failure here shouldn't
          // block or surface as if the whole publish failed.
          if (GROUPS_ENABLED) void GroupService.updateLastSelectedGroups(selectedGroupIds);
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
      <div className="max-w-md mx-auto pt-16">
        <BackBar title="Edit listing" onBack={() => navigate("/my-stuff")} />
        <div className="px-4 py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (isEditMode && existingItemLoadError) {
    return (
      <div className="max-w-md mx-auto pt-16">
        <BackBar title="Edit listing" onBack={() => navigate("/my-stuff")} />
        <div className="px-4 py-12 text-center text-gray-600">
          Couldn't load this listing. It may have been removed.
        </div>
      </div>
    );
  }

  if (isEditMode && existingItem && (existingItem.status ?? "active") !== "active") {
    return (
      <div className="max-w-md mx-auto pt-16">
        <BackBar title="Edit listing" onBack={() => navigate("/my-stuff")} />
        <div className="px-4 py-12 text-center">
          <p className="text-gray-600 mb-6">
            This listing has already been <span className="capitalize">{existingItem.status}</span>,
            so it can't be edited. Relist it instead to create a fresh
            listing with the same details.
          </p>
          <button
            onClick={() => navigate("/add", { state: { relistFrom: existingItem } })}
            className="px-6 py-3 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors font-semibold"
          >
            Relist this item
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pt-16">
      <BackBar title={isEditMode ? "Edit listing" : "Add a listing"} onBack={() => navigate("/my-stuff")} />
      <div className="px-4 py-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{isEditMode ? "Edit Listing" : "Add New Item"}</h1>
          <p className="text-gray-600">
            {isEditMode ? "Update your item's details" : "Share an item you'd like to exchange"}
          </p>
        </div>
  
        <form onSubmit={handleSubmit} className="space-y-6">
          {saveAttempted && invalidFields.length > 0 && (
            <div className="px-3.5 py-3 rounded-xl bg-[oklch(93%_0.06_40)] text-[oklch(38%_0.12_35)] text-sm font-bold text-center">
              {invalidFields.length === 1 ? "1 field needs attention" : `${invalidFields.length} fields need attention`}
            </div>
          )}
  
          {/* Listing type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Listing type</label>
            {isEditMode ? (
              <>
                <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                  {listingType === "giveaway" ? "Giveaway" : "Trade"}
                </div>
                <p className="text-xs text-gray-500 mt-1">Listing type can't be changed after an item is created.</p>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setListingType("trade")}
                    className={`w-full px-3 py-2 rounded-lg border font-medium transition-colors ${
                      listingType === "trade"
                        ? "bg-barter-600 text-white border-barter-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Trade
                  </button>
                  <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full">
                    <InfoTooltip
                      text="You'll exchange this item for something else the other person offers."
                      label="Trade"
                    />
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setListingType("giveaway")}
                    className={`w-full px-3 py-2 rounded-lg border font-medium transition-colors ${
                      listingType === "giveaway"
                        ? "bg-barter-600 text-white border-barter-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Giveaway
                  </button>
                  <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full">
                    <InfoTooltip
                      text="You're giving this item away for free, no exchange expected."
                      label="Giveaway"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Visibility */}
          {GROUPS_ENABLED && (
          <div>
            <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
              Visibility
              <InfoTooltip
                text="Public listings are visible to everyone, including all your groups. Turn Public off and pick specific groups to share privately with just them instead."
                label="Visibility"
              />
            </label>
            <div className="flex items-center justify-between px-3.5 py-3 border border-gray-300 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900">Public listing</div>
                <div className="text-xs text-gray-500 mt-0.5">Anyone browsing Barter can see this.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-3">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isPublic}
                  onChange={(e) => {
                    if (!e.target.checked && selectedGroupIds.length === 0) {
                      toast.error("Share to at least one group before turning Public off.");
                      return;
                    }
                    setIsPublic(e.target.checked);
                    if (e.target.checked) setSelectedGroupIds(userGroups.map((g) => g.id));
                  }}
                />
                <div className="w-11 h-6 bg-[oklch(90%_0.01_95)] rounded-full peer peer-checked:bg-barter-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
            </div>

            <div className="mt-3">
              <div className="text-sm font-medium text-gray-700 mb-2">Share to groups</div>
              {userGroups.length === 0 ? (
                <p className="text-xs text-gray-500">
                  You're not in any groups yet.{" "}
                  <Link to="/groups" className="text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline">
                    Create
                  </Link>{" "}
                  one to share listings privately, or wait for an invite to join one.
                </p>
              ) : (
                <div className="space-y-2">
                  {userGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center space-x-2 text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={(e) => {
                          setSelectedGroupIds((prev) => {
                            const next = e.target.checked
                              ? [...prev, group.id]
                              : prev.filter((id) => id !== group.id);
                            setIsPublic(next.length === 0);
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-barter-600 focus:ring-barter-600"
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          {/* Image Upload */}
          <div ref={photosRef} onMouseDown={() => markTouched("photos")}>
            <label className="block text-sm font-medium text-gray-700 mb-2">Photos (Up to 10 images)</label>
            <div className="relative">
              {photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative">
                      <img
                        src={photo.type === "existing" ? photo.url : photo.preview}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => handleSetPrimaryPhoto(index)}
                        disabled={index === 0}
                        aria-label={index === 0 ? "Primary photo" : "Set as primary photo"}
                        className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                          index === 0
                            ? "bg-yellow-400 text-white"
                            : "bg-white/80 text-gray-500 hover:bg-white hover:text-yellow-500"
                        }`}
                      >
                        <Star className="w-4 h-4" fill={index === 0 ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 10 && (
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
            {showError("photos") && (
              <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">At least one photo is required</p>
            )}
          </div>
  
          {/* Title */}
          <div ref={titleRef}>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => markTouched("title")}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent ${
                showError("title") ? "border-[oklch(55%_0.15_30)]" : "border-gray-300"
              }`}
              placeholder="Enter item title"
            />
            {showError("title") && <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">Title is required</p>}
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
              placeholder="Describe your item..."
            />
          </div>
  
          {/* Category */}
          <div ref={categoryRef}>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
              Category *
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => markTouched("category")}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent ${
                showError("category") ? "border-[oklch(55%_0.15_30)]" : "border-gray-300"
              }`}
            >
              <option value="">Select a category</option>
              {ITEM_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {showError("category") && (
              <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">Category is required</p>
            )}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                  placeholder="e.g. Board Games"
                />
                <p className="text-xs text-gray-500 mt-1">Your listing will show under Other for now.</p>
              </div>
            )}
          </div>
  
          {/* Condition */}
          <div ref={conditionRef}>
            <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-2">
              Condition *
            </label>
            <select
              id="condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              onBlur={() => markTouched("condition")}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent ${
                showError("condition") ? "border-[oklch(55%_0.15_30)]" : "border-gray-300"
              }`}
            >
              <option value="">Select condition</option>
              {ITEM_CONDITIONS.map((cond) => (
                <option key={cond} value={cond}>
                  {cond}
                </option>
              ))}
            </select>
            {showError("condition") && (
              <p className="text-xs font-semibold text-[oklch(50%_0.15_30)] mt-1.5">Condition is required</p>
            )}
          </div>
  
          {/* Location */}
          <div>
            <label htmlFor="itemLocation" className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <div className="flex items-center text-gray-600">
              <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
              <div className="flex-1 flex items-center space-x-2 relative">
                <input
                  id="itemLocation"
                  type="text"
                  value={itemLocation}
                  onChange={(e) => {
                    const value = e.target.value;
                    setItemLocation(value);
                    setItemLatitude(null);
                    setItemLongitude(null);

                    if (itemLocationSearchTimeoutRef.current) {
                      clearTimeout(itemLocationSearchTimeoutRef.current);
                    }

                    const trimmed = value.trim();
                    if (trimmed.length < 3) {
                      setItemLocationSuggestions([]);
                      setShowItemLocationDropdown(false);
                      return;
                    }

                    itemLocationSearchTimeoutRef.current = setTimeout(async () => {
                      try {
                        const { data, error } = await supabase.functions.invoke("places-autocomplete", {
                          body: { query: trimmed },
                        });
                        if (error) {
                          toast.error("Failed to search locations");
                          setItemLocationSuggestions([]);
                          setShowItemLocationDropdown(false);
                          return;
                        }
                        setItemLocationSuggestions(data?.suggestions || []);
                        setShowItemLocationDropdown(true);
                      } catch (err) {
                        toast.error("Failed to search locations");
                        setItemLocationSuggestions([]);
                        setShowItemLocationDropdown(false);
                      }
                    }, 350);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowItemLocationDropdown(false);
                    }
                  }}
                  onBlur={() => setShowItemLocationDropdown(false)}
                  className="flex-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                  placeholder="Enter this item's location"
                />
                <button
                  type="button"
                  onClick={getCurrentItemLocation}
                  disabled={itemLocationLoading}
                  className="flex items-center space-x-1 px-3 py-2 bg-barter-100 text-barter-700 rounded-lg hover:bg-barter-200 transition-colors disabled:opacity-50"
                >
                  {itemLocationLoading ? (
                    <LoadingSpinner />
                  ) : (
                    <>
                      <Navigation className="w-4 h-4" />
                      <span className="text-xs">GPS</span>
                    </>
                  )}
                </button>
                {showItemLocationDropdown && itemLocationSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-56 overflow-y-auto">
                    {itemLocationSuggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.label}-${index}`}
                        type="button"
                        onMouseDown={async () => {
                          let locationString = suggestion.label;
                          try {
                            const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke(
                              "reverse-geocode",
                              { body: { lat: suggestion.lat, lng: suggestion.lng } }
                            );
                            if (!geocodeError && geocodeData?.location) {
                              locationString = geocodeData.location;
                            }
                          } catch (err) {
                            // fall back to suggestion.label
                          }
                          setItemLocation(locationString);
                          setItemLatitude(suggestion.lat);
                          setItemLongitude(suggestion.lng);
                          setShowItemLocationDropdown(false);
                          setItemLocationSuggestions([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">Defaults to your profile location. Change it if this item is elsewhere.</p>
          </div>

          {/* Item Value */}
          {listingType !== "giveaway" && (
            <div>
              <label htmlFor="estimatedValue" className="block text-sm font-medium text-gray-700 mb-2">
                Estimated value (optional)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm font-medium">
                    {currency}
                  </span>
                  <input
                    id="estimatedValue"
                    type="number"
                    value={estimatedValue}
                    onChange={(e) => setEstimatedValue(e.target.value)}
                    className="w-full pl-14 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                  />
                </div>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                >
                  {[...new Set([...CURRENCIES, currency])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">Help others understand your item's value for fair trades. Leave blank if you're not sure.</p>
            </div>
          )}

          {/* More info link */}
          <div>
            <label htmlFor="sourceUrl" className="block text-sm font-medium text-gray-700 mb-2">
              More info link (optional)
            </label>
            <input
              id="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
              placeholder="https://..."
            />
            <p className="text-xs text-gray-500 mt-1">Link to the original listing, if this item came from somewhere else.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-barter-600 text-white py-3 rounded-lg font-medium hover:bg-barter-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <LoadingSpinner /> : isEditMode ? "Save changes" : "Add Item"}
          </button>
          {isEditMode && (existingItem?.status ?? "active") === "active" && (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="w-full py-3 text-sm font-bold text-[oklch(50%_0.15_30)] mt-2"
            >
              Cancel listing
            </button>
          )}
        </form>
      </div>

      {confirmingCancel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => setConfirmingCancel(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Cancel this listing?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
              This can't be undone. Anyone you're chatting with about it will be notified it's no longer available.
            </div>
            <button
              onClick={() => setConfirmingCancel(false)}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2"
            >
              Keep listing
            </button>
            <button
              onClick={handleConfirmCancel}
              disabled={cancelItemLoading}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-50"
            >
              {cancelItemLoading ? "Cancelling…" : "Cancel listing"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
