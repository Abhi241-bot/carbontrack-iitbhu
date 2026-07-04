import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Building2, Layers, Zap, Trash2, ArrowRight, MapPin, Globe, Compass, AlertCircle } from 'lucide-react';

import PageWrapper from '@/components/layout/PageWrapper';
import Skeleton from '@/components/common/Skeleton';
import { campusApi } from '@/features/campus/campusApi';

export default function MapPage() {
  const navigate = useNavigate();
  const [selectedCampusSlug, setSelectedCampusSlug] = useState<string>('');
  const [selectedBuilding, setSelectedBuilding] = useState<any | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [geojson, setGeojson] = useState<any>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const isMapLoadedRef = useRef(false);

  // 1. Fetch all campuses
  const { data: campusesRes, isLoading: campusesLoading } = useQuery({
    queryKey: ['campuses'],
    queryFn: () => campusApi.getAll().then((r) => r.data.data as any[]),
  });
  const campuses = campusesRes ?? [];

  // Default select first campus when loaded
  useEffect(() => {
    if (campuses.length > 0 && !selectedCampusSlug) {
      setSelectedCampusSlug(campuses[0].slug);
    }
  }, [campuses, selectedCampusSlug]);

  // 2. Fetch buildings for selected campus
  const { data: buildingsRes, isLoading: buildingsLoading } = useQuery({
    queryKey: ['campus-buildings', selectedCampusSlug],
    queryFn: () => campusApi.getBuildingsByCampus(selectedCampusSlug, { limit: 1000 }),
    enabled: !!selectedCampusSlug,
  });
  const buildings = buildingsRes?.data?.data?.buildings ?? [];

  // Keep a ref of buildings to avoid stale closure issues in map click handlers
  const buildingsRef = useRef<any[]>([]);
  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);

  // 3. Compute Map Center dynamically [longitude, latitude] for MapLibre
  const mapCenter = useMemo<[number, number]>(() => {
    if (buildings.length === 0) return [82.993, 25.267];

    let latSum = 0;
    let lngSum = 0;
    let count = 0;

    for (const b of buildings) {
      if (b.latitude && b.longitude) {
        latSum += b.latitude;
        lngSum += b.longitude;
        count++;
      }
    }

    return count > 0 ? [lngSum / count, latSum / count] : [82.993, 25.267];
  }, [buildings]);

  // 4. Load static campus GeoJSON (IIT BHU) or generate dynamically (fallbacks)
  useEffect(() => {
    if (!selectedCampusSlug) return;

    if (selectedCampusSlug === 'iitbhu') {
      // Fetch full shapefile campus footprints
      fetch('/iitbhu_geojson.json')
        .then((res) => res.json())
        .then((data) => {
          // Merge latest DB statistics (name, carbon results status) dynamically
          const updatedFeatures = data.features.map((f: any) => {
            if (f.properties.registered) {
              const dbB = buildings.find((b: any) => b._id === f.properties.id);
              if (dbB) {
                return {
                  ...f,
                  properties: {
                    ...f.properties,
                    name: dbB.name,
                    hasData: !!dbB.combinedCarbonResults,
                  },
                };
              }
            }
            return f;
          });
          setGeojson({
            type: 'FeatureCollection',
            features: updatedFeatures,
          });
        })
        .catch((err) => {
          console.error('Error fetching static campus geojson:', err);
        });
    } else {
      // Fallback: build dynamically from database buildings list
      const features = buildings.map((b: any) => {
        if (!b.latitude || !b.longitude) return null;
        
        const hasFootprint = b.footprintGeometry && b.footprintGeometry.coordinates;
        const height = b.shapefileHeight ?? (b.floors || 1) * 4.5;

        let geometry = b.footprintGeometry;

        if (!hasFootprint) {
          const floors = b.floors || 1;
          const footprintArea = (b.totalArea || 1200) / floors;
          const sideLength = Math.max(16, Math.min(60, Math.sqrt(footprintArea)));

          const dLat = (sideLength / 2) / 111320;
          const dLng = (sideLength / 2) / 100670;
          const lng = b.longitude;
          const lat = b.latitude;

          geometry = {
            type: 'Polygon',
            coordinates: [[
              [lng - dLng, lat - dLat],
              [lng + dLng, lat - dLat],
              [lng + dLng, lat + dLat],
              [lng - dLng, lat + dLat],
              [lng - dLng, lat - dLat],
            ]]
          };
        }

        return {
          type: 'Feature',
          properties: {
            id: b._id,
            name: b.name,
            height: height,
            base: 0,
            hasData: !!b.combinedCarbonResults,
            registered: true,
          },
          geometry,
        };
      }).filter(Boolean);

      setGeojson({
        type: 'FeatureCollection',
        features,
      });
    }
  }, [buildings, selectedCampusSlug]);

  // 5. Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current) return;

    setMapLoaded(false);
    isMapLoadedRef.current = false;

    // Destroy existing map instance to prevent double-initialization
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: mapCenter,
      zoom: 16.5,
      pitch: 60,
      bearing: -20,
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
      }),
      'top-right'
    );

    map.on('load', () => {
      isMapLoadedRef.current = true;
      setMapLoaded(true);
    });

    return () => {
      isMapLoadedRef.current = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapCenter]);

  // 6. Update Building Markers & 3D Building Extrusions when data loads/changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !isMapLoadedRef.current || !map.isStyleLoaded() || !geojson) return;

    const source: any = map.getSource('campus-buildings-3d');
    if (source) {
      source.setData(geojson);
    } else {
      map.addSource('campus-buildings-3d', {
        type: 'geojson',
        data: geojson,
      });

      const layers = map.getStyle().layers;
      const labelLayerId = layers.find(
        (layer) => layer.type === 'symbol' && layer.layout && layer.layout['text-field']
      )?.id;

      map.addLayer(
        {
          id: '3d-buildings-extruded',
          source: 'campus-buildings-3d',
          type: 'fill-extrusion',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': [
              'case',
              ['boolean', ['get', 'hasData'], false],
              '#B91C1C', // Rich IIT BHU Red for data-verified buildings
              '#4B5563'  // Slate grey for no-data / unregistered buildings
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-opacity': 0.85,
          },
        },
        labelLayerId
      );

      // Handle clicking extruded building structures directly
      map.on('click', '3d-buildings-extruded', (e) => {
        const feature = e.features?.[0];
        if (feature) {
          const props = feature.properties;
          const isRegistered = props.registered === true || props.registered === 'true';
          
          if (isRegistered) {
            const dbB = buildingsRef.current.find((b: any) => b._id === props.id);
            if (dbB) {
              setSelectedBuilding(dbB);
            }
          } else {
            setSelectedBuilding({
              name: props.name,
              type: 'institutional',
              floors: Math.round((props.height ?? 8.0) / 4.5) || 1,
              totalArea: 0,
              isUnregistered: true
            });
          }
        }
      });

      // Pointer cursor when hovering building layers
      map.on('mouseenter', '3d-buildings-extruded', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', '3d-buildings-extruded', () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add glowing pins for registered buildings only
    buildings.forEach((b: any) => {
      if (!b.latitude || !b.longitude) return;

      const hasData = !!b.combinedCarbonResults;

      const el = document.createElement('div');
      el.className = 'custom-3d-pin cursor-pointer relative';
      
      const pinColor = hasData 
        ? 'bg-gradient-to-br from-red-400 to-red-600 border-white shadow-[0_0_15px_rgba(239,68,68,0.7)]' 
        : 'bg-gradient-to-br from-gray-400 to-gray-600 border-white/50 shadow-[0_0_8px_rgba(107,114,128,0.5)]';
      const stemColor = hasData ? 'from-red-500' : 'from-gray-500';
      const pulseHtml = hasData 
        ? '<div class="w-2.5 h-2.5 rounded-full bg-white animate-ping"></div>' 
        : '<div class="w-1.5 h-1.5 rounded-full bg-white/70"></div>';

      el.innerHTML = `
        <div class="flex flex-col items-center group select-none" style="transform: translate(-50%, -100%);">
          <!-- Hover Tooltip -->
          <div class="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/90 border border-white/10 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none z-50">
            <div class="font-bold">${b.name}</div>
            <div class="text-[10px] text-gray-400 mt-0.5">
              ${hasData ? `${(b.combinedCarbonResults.totalLifecycle ?? 0).toLocaleString()} tCO₂e` : 'No verified data'}
            </div>
          </div>
          <!-- 3D Floating Bead -->
          <div class="w-6 h-6 rounded-full border-2 ${pinColor} flex items-center justify-center transition-all duration-200 group-hover:scale-110 active:scale-95">
            ${pulseHtml}
          </div>
          <!-- 3D Connecting Stem -->
          <div class="w-0.5 h-6 bg-gradient-to-b ${stemColor} to-transparent"></div>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent map click triggers
        setSelectedBuilding(b);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([b.longitude, b.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [geojson, mapLoaded, buildings]);

  // Clear selected building on campus switch
  useEffect(() => {
    setSelectedBuilding(null);
  }, [selectedCampusSlug]);

  return (
    <PageWrapper title="Interactive Campus Map">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6 h-[calc(100vh-140px)]">
        
        {/* Campus Selector Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black/40 backdrop-blur-md border border-white/5 p-4 rounded-xl">
          <div className="flex items-center gap-3">
            <Globe className="text-iitbhu w-6 h-6 animate-pulse" />
            <div>
              <h2 className="text-lg font-bold text-white">Interactive 3D Campus Map</h2>
              <p className="text-xs text-gray-400">Right-click and drag to rotate/tilt the view. Click any 3D shape or pin to select it.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">Active Campus:</span>
            {campusesLoading ? (
              <Skeleton className="h-9 w-40 rounded-lg" />
            ) : (
              <select
                value={selectedCampusSlug}
                onChange={(e) => setSelectedCampusSlug(e.target.value)}
                className="bg-black/60 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-iitbhu"
              >
                {campuses.map((c: any) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Map and Detail Panel Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow min-h-0">
          
          {/* MapContainer for MapLibre */}
          <div className="lg:col-span-2 rounded-xl overflow-hidden border border-white/5 relative bg-black/50 h-[400px] lg:h-full">
            {buildingsLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
                <div className="w-10 h-10 border-4 border-iitbhu border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : null}
            <div ref={mapContainerRef} className="w-full h-full z-0" />
            
            {/* Map Legend */}
            <div className="absolute bottom-4 left-4 z-10 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-2 rounded-lg text-xs flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-600 border border-white"></div>
                <span className="text-gray-300 font-medium">Data Verified Building</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500 border border-gray-300"></div>
                <span className="text-gray-300 font-medium">No verified data yet / Unregistered</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1 border-t border-white/5 pt-1.5">
                <Compass size={10} className="animate-spin-slow" />
                <span>Right-click + drag to rotate</span>
              </div>
            </div>
          </div>

          {/* Building Details Panel */}
          <div className="bg-black/40 backdrop-blur-md border border-white/5 rounded-xl p-5 flex flex-col h-[450px] lg:h-full overflow-hidden">
            <h3 className="text-lg font-bold text-white border-b border-white/5 pb-3 flex items-center gap-2">
              <Building2 className="text-iitbhu w-5 h-5" />
              Building Details
            </h3>

            <div className="flex-grow overflow-y-auto py-4">
              {!selectedBuilding ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <MapPin className="text-gray-600 w-12 h-12 mb-3" />
                  <p className="text-gray-400 text-sm font-medium">No building selected</p>
                  <p className="text-gray-500 text-xs mt-1">Click on any marker or 3D block on the map to view its details.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Metadata Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Metadata</h4>
                    <div className="border border-white/5 rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                        <tbody>
                          <tr className="border-b border-white/5">
                            <td className="px-3 py-2 text-gray-400 font-medium bg-white/5 w-1/3">Name</td>
                            <td className="px-3 py-2 text-white font-semibold">{selectedBuilding.name}</td>
                          </tr>
                          <tr className="border-b border-white/5">
                            <td className="px-3 py-2 text-gray-400 font-medium bg-white/5">Type</td>
                            <td className="px-3 py-2 text-white capitalize">{selectedBuilding.type.replace('_', ' ')}</td>
                          </tr>
                          <tr className="border-b border-white/5">
                            <td className="px-3 py-2 text-gray-400 font-medium bg-white/5">Floors</td>
                            <td className="px-3 py-2 text-white">{selectedBuilding.floors}</td>
                          </tr>
                          <tr className="border-b border-white/5">
                            <td className="px-3 py-2 text-gray-400 font-medium bg-white/5">Area</td>
                            <td className="px-3 py-2 text-white">{selectedBuilding.totalArea ? `${selectedBuilding.totalArea.toLocaleString()} m²` : '—'}</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2 text-gray-400 font-medium bg-white/5">Status</td>
                            <td className="px-3 py-2">
                              {selectedBuilding.isUnregistered ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 rounded">
                                  Unregistered
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-iitbhu bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
                                  Registered
                                </span>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Carbon Summary Section */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Carbon Footprint Analysis</h4>
                    {selectedBuilding.isUnregistered ? (
                      <div className="bg-gray-500/10 border border-gray-500/20 text-gray-400 rounded-lg p-3 text-xs leading-relaxed flex gap-2">
                        <AlertCircle className="w-5 h-5 text-gray-400 shrink-0" />
                        <div>
                          This building footprint is mapped from shapefiles but is not registered in the system. Go to the admin panel or campuses dashboard to register it.
                        </div>
                      </div>
                    ) : !selectedBuilding.combinedCarbonResults ? (
                      <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-lg p-3 text-xs leading-relaxed">
                        There is no verified carbon data registered for this building yet. Proceed to buildings section to start entry.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Scope Cards */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-white/5 rounded-lg p-2 text-center border border-white/5">
                            <span className="text-[10px] text-gray-400 uppercase font-medium">Scope 1</span>
                            <span className="block text-sm font-bold text-white mt-1">
                              {selectedBuilding.combinedCarbonResults.breakdown?.byScope?.scope1 ?? 0}
                            </span>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 text-center border border-white/5">
                            <span className="text-[10px] text-gray-400 uppercase font-medium">Scope 2</span>
                            <span className="block text-sm font-bold text-white mt-1">
                              {selectedBuilding.combinedCarbonResults.breakdown?.byScope?.scope2 ?? 0}
                            </span>
                          </div>
                          <div className="bg-white/5 rounded-lg p-2 text-center border border-white/5">
                            <span className="text-[10px] text-gray-400 uppercase font-medium">Scope 3</span>
                            <span className="block text-sm font-bold text-white mt-1">
                              {selectedBuilding.combinedCarbonResults.breakdown?.byScope?.scope3 ?? 0}
                            </span>
                          </div>
                        </div>

                        {/* Detailed Table */}
                        <div className="border border-white/5 rounded-lg overflow-hidden">
                          <table className="w-full text-sm text-left">
                            <tbody>
                              <tr className="border-b border-white/5">
                                <td className="px-3 py-2 text-gray-400 font-medium bg-white/5 flex items-center gap-1.5">
                                  <Layers size={13} className="text-iitbhu" />
                                  Embodied
                                </td>
                                <td className="px-3 py-2 text-white font-semibold">
                                  {selectedBuilding.combinedCarbonResults.embodiedCarbon?.toLocaleString() ?? 0} <span className="text-[10px] text-gray-400 font-normal">tCO₂e</span>
                                </td>
                              </tr>
                              <tr className="border-b border-white/5">
                                <td className="px-3 py-2 text-gray-400 font-medium bg-white/5 flex items-center gap-1.5">
                                  <Zap size={13} className="text-yellow-500" />
                                  Operational
                                </td>
                                <td className="px-3 py-2 text-white font-semibold">
                                  {selectedBuilding.combinedCarbonResults.operationalCarbonPerYear?.toLocaleString() ?? 0} <span className="text-[10px] text-gray-400 font-normal">tCO₂e/yr</span>
                                </td>
                              </tr>
                              <tr className="border-b border-white/5">
                                <td className="px-3 py-2 text-gray-400 font-medium bg-white/5 flex items-center gap-1.5">
                                  <Trash2 size={13} className="text-red-500" />
                                  Waste
                                </td>
                                <td className="px-3 py-2 text-white font-semibold">
                                  {selectedBuilding.combinedCarbonResults.wasteCarbonPerYear?.toLocaleString() ?? 0} <span className="text-[10px] text-gray-400 font-normal">tCO₂e/yr</span>
                                </td>
                              </tr>
                              <tr className="bg-white/5 font-bold">
                                <td className="px-3 py-2 text-white">Lifecycle Total</td>
                                <td className="px-3 py-2 text-iitbhu">
                                  {selectedBuilding.combinedCarbonResults.totalLifecycle?.toLocaleString() ?? 0} <span className="text-[10px] text-gray-400 font-normal">tCO₂e</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Proceed to Dashboard footer option */}
        <div className="flex items-center justify-center border-t border-white/5 pt-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-iitbhu text-white font-semibold hover:bg-opacity-95 shadow-lg shadow-iitbhu/20 active:scale-[0.98] transition-all"
          >
            Proceed to Analytics Dashboard
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
