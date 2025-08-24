'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Type for geocoder results
interface GeocoderResult {
  result: {
    center: [number, number];
    place_name: string;
  };
}

declare const MapboxGeocoder: any;

interface MapboxMapProps {
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  initialLat?: number;
  initialLng?: number;
  className?: string;
}

export default function MapboxMap({ onLocationSelect, initialLat = 40.7128, initialLng = -74.0060, className = '' }: MapboxMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return; // Prevent re-initialization

    // Check if Mapbox token is available
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token || token === 'your_mapbox_access_token_here') {
      setError('Mapbox API token not configured. Please set NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in your environment.');
      return;
    }

    try {
      // Initialize Mapbox
      mapboxgl.accessToken = token;

      // Create map
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [initialLng, initialLat],
        zoom: 12
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add geocoder (search) only if available
      try {
        if (typeof MapboxGeocoder !== 'undefined') {
          const geocoder = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl: mapboxgl,
            placeholder: 'Search for location...',
            marker: false
          });

          map.current.addControl(geocoder, 'top-left');

          // Handle geocoder result
          geocoder.on('result', (e: GeocoderResult) => {
            const { center, place_name } = e.result;
            const [lng, lat] = center;
            
            // Add marker
            new mapboxgl.Marker({ color: '#10b981' })
              .setLngLat(center)
              .addTo(map.current!);
              
            onLocationSelect(lat, lng, place_name);
          });
        }
      } catch (error) {
        console.warn('Geocoder not available:', error);
      }

      // Handle map clicks
      map.current.on('click', async (e) => {
        const { lng, lat } = e.lngLat;
        
        // Add/update marker
        const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
        existingMarkers.forEach(marker => marker.remove());
        
        new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat([lng, lat])
          .addTo(map.current!);

        // Reverse geocoding to get address
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
          );
          const data = await response.json();
          
          const address = data.features?.[0]?.place_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          onLocationSelect(lat, lng, address);
        } catch (error) {
          console.error('Reverse geocoding failed:', error);
          onLocationSelect(lat, lng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
      });

      map.current.on('load', () => {
        setIsLoaded(true);
        
        // Add initial marker if coordinates are provided
        if (initialLat !== 40.7128 || initialLng !== -74.0060) {
          new mapboxgl.Marker({ color: '#10b981' })
            .setLngLat([initialLng, initialLat])
            .addTo(map.current!);
        }
      });

    } catch (error) {
      console.error('Failed to initialize Mapbox:', error);
      setError('Failed to load map. Please check your connection and API key.');
    }

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // Empty dependency array to prevent re-initialization

  // Separate effect for updating marker position when props change
  useEffect(() => {
    if (map.current && isLoaded && (initialLat !== 40.7128 || initialLng !== -74.0060)) {
      // Remove existing markers
      const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
      existingMarkers.forEach(marker => marker.remove());
      
      // Add new marker
      new mapboxgl.Marker({ color: '#10b981' })
        .setLngLat([initialLng, initialLat])
        .addTo(map.current);
        
      // Center map on new location
      map.current.flyTo({
        center: [initialLng, initialLat],
        zoom: 15
      });
    }
  }, [initialLat, initialLng, isLoaded]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-800 rounded-lg ${className}`}>
        <div className="text-center p-6">
          <div className="text-red-400 mb-2">⚠️ Map Unavailable</div>
          <div className="text-gray-400 text-sm max-w-sm mx-auto">{error}</div>
          <button
            onClick={() => onLocationSelect(40.7128, -74.0060, "New York, NY, USA")}
            className="mt-4 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
          >
            Use Demo Location (NYC)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div 
        ref={mapContainer} 
        className="w-full h-full rounded-lg"
        style={{ minHeight: '400px' }}
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-lg">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <div className="text-gray-400">Loading map...</div>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-xs text-gray-500 bg-black/50 px-2 py-1 rounded">
        Click on map to select location
      </div>
    </div>
  );
}