"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
  _raw: google.maps.places.PlacePrediction;
}

interface PlaceAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  id?: string;
}

export function PlaceAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Rue et numéro, NPA Localité",
  id,
}: PlaceAutocompleteProps) {
  const places = useMapsLibrary("places");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelectingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!places || !value || value.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const request: google.maps.places.AutocompleteRequest = {
          input: value,
          includedRegionCodes: ["ch"],
        };

        const { suggestions: results } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

        const mapped: Suggestion[] = results
          .filter((s) => s.placePrediction)
          .map((s) => {
            const p = s.placePrediction!;
            return {
              placeId: p.placeId,
              mainText: p.mainText?.text ?? "",
              secondaryText: p.secondaryText?.text ?? "",
              fullText: p.text?.text ?? "",
              _raw: p,
            };
          });

        setSuggestions(mapped);
        setIsOpen(mapped.length > 0);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [places, value]);

  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (isSelectingRef.current) return;
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const handleSelect = useCallback(
    async (suggestion: Suggestion) => {
      isSelectingRef.current = true;

      try {
        const place = suggestion._raw.toPlace();
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress"],
        });

        const addressComponents: google.maps.GeocoderAddressComponent[] =
          (place.addressComponents ?? []).map((c) => ({
            long_name: c.longText ?? "",
            short_name: c.shortText ?? "",
            types: c.types ?? [],
          }));

        const legacyResult: google.maps.places.PlaceResult = {
          address_components: addressComponents,
          formatted_address: place.formattedAddress ?? suggestion.fullText,
        };

        onChange(legacyResult.formatted_address || suggestion.fullText);
        onPlaceSelect?.(legacyResult);
        setIsOpen(false);

      } catch {
        onChange(suggestion.fullText);
        setIsOpen(false);
      } finally {
        isSelectingRef.current = false;
      }
    },
    [onChange, onPlaceSelect],
  );

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!isSelectingRef.current) {
            setTimeout(() => {
              if (!isSelectingRef.current) setIsOpen(false);
            }, 200);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
      />

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.placeId}
              role="option"
              className="w-full px-3 py-2 text-left text-sm active:bg-muted cursor-pointer border-b border-border last:border-b-0"
              onMouseDown={(e) => {
                e.preventDefault();
                isSelectingRef.current = true;
                handleSelect(suggestion);
              }}
            >
              <div className="font-medium text-foreground">{suggestion.mainText}</div>
              <div className="text-xs text-muted-foreground">{suggestion.secondaryText}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
