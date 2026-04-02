"use client";

import { useState } from "react";
import { APIProvider, Map as GMap, AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';

const MOCK_REGIONAL_DATA: Record<string, { lat: number; lng: number; location: string; priceAdjust: number }[]> = {
  soy: [
    { lat: -12.545, lng: -55.726, location: "Sorriso, MT", priceAdjust: -5.5 }, 
    { lat: -23.304, lng: -51.169, location: "Londrina, PR", priceAdjust: +2.0 },
    { lat: -25.504, lng: -48.533, location: "Paranaguá, PR (Porto)", priceAdjust: +8.5 },
  ],
  corn: [
    { lat: -12.545, lng: -55.726, location: "Sorriso, MT", priceAdjust: -3.5 },
    { lat: -17.802, lng: -50.921, location: "Rio Verde, GO", priceAdjust: -1.0 },
    { lat: -22.906, lng: -47.061, location: "Campinas, SP", priceAdjust: +5.0 },
  ],
  coffee: [
    { lat: -21.787, lng: -46.561, location: "Poços de Caldas, MG", priceAdjust: 0 },
    { lat: -19.747, lng: -47.939, location: "Franca, SP", priceAdjust: +12.0 },
    { lat: -11.433, lng: -61.447, location: "Cacoal, RO (Conilon)", priceAdjust: -250.0 },
  ],
  sugar: [
    { lat: -21.170, lng: -47.810, location: "Ribeirão Preto, SP", priceAdjust: +2.5 },
    { lat: -18.912, lng: -48.275, location: "Uberlândia, MG", priceAdjust: -1.0 },
    { lat: -9.666,  lng: -35.735, location: "Maceió, AL (Porto)", priceAdjust: -3.5 },
  ],
  cotton: [
    { lat: -12.146, lng: -44.990, location: "Barreiras, BA", priceAdjust: +1.5 },
    { lat: -13.064, lng: -55.908, location: "Lucas do Rio Verde, MT", priceAdjust: -2.0 },
    { lat: -15.598, lng: -56.094, location: "Cuiabá, MT", priceAdjust: -1.5 },
  ],
  citrus: [
    { lat: -21.794, lng: -48.176, location: "Araraquara, SP", priceAdjust: +1.0 },
    { lat: -20.812, lng: -49.375, location: "São José do Rio Preto, SP", priceAdjust: 0 },
    { lat: -22.753, lng: -47.332, location: "Americana, SP", priceAdjust: +2.0 },
  ]
};

const defaultCenter = { lat: -15.7801, lng: -47.9292 }; // Brasilia

function getRegionsForCommodity(c: any) {
  if (!c) return null;
  const name = (c.name_pt || c.id || "").toLowerCase();
  if (name.includes("soja") || name.includes("soy")) return MOCK_REGIONAL_DATA.soy;
  if (name.includes("milho") || name.includes("corn")) return MOCK_REGIONAL_DATA.corn;
  if (name.includes("café") || name.includes("coffee") || name.includes("cafe")) return MOCK_REGIONAL_DATA.coffee;
  if (name.includes("açúcar") || name.includes("sugar") || name.includes("acucar")) return MOCK_REGIONAL_DATA.sugar;
  if (name.includes("algodão") || name.includes("cotton") || name.includes("algodao")) return MOCK_REGIONAL_DATA.cotton;
  if (name.includes("laranja") || name.includes("citrus") || name.includes("orange")) return MOCK_REGIONAL_DATA.citrus;
  return null;
}

function MapWithGoogle({ commodities, lang, selectedCommodityId, setSelectedCommodityId, activeMarker, setActiveMarker }: any) {
  const currentCommodity = commodities.find((c: any) => c.id === selectedCommodityId);
  const regionalData = getRegionsForCommodity(currentCommodity) || [{ lat: -15.7801, lng: -47.9292, location: "Nacional (Média)", priceAdjust: 0 }];

  return (
    <div className="flex flex-col h-[500px] border border-neutral-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="p-3 bg-neutral-50 border-b border-neutral-200 flex gap-2 overflow-x-auto shrink-0">
        {commodities.map((c: any) => (
          <button
            key={c.id}
            onClick={() => {
              setSelectedCommodityId(c.id);
              setActiveMarker(null);
            }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md whitespace-nowrap transition-colors ${
              selectedCommodityId === c.id 
                ? "bg-brand-primary text-white shadow-sm" 
                : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {lang === "pt" ? c.name_pt : c.name_en}
          </button>
        ))}
      </div>
      
      <div className="flex-1 relative z-0">
        <GMap
          defaultCenter={defaultCenter}
          defaultZoom={4}
          mapId="commodity-pulse-map"
          style={{ width: "100%", height: "100%" }}
          disableDefaultUI
          gestureHandling="cooperative"
        >
          {regionalData.map((region: any, idx: number) => {
            const markerId = `${selectedCommodityId}-${idx}`;
            
            return (
              <AdvancedMarker
                key={markerId}
                position={{ lat: region.lat, lng: region.lng }}
                onClick={() => setActiveMarker(markerId)}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    backgroundColor: `rgba(66, 107, 0, 1)`,
                    border: "2px solid rgba(255, 255, 255, 1)",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
                  }}
                />
              </AdvancedMarker>
            );
          })}

          {activeMarker && (() => {
             const [cmdId, strIdx] = activeMarker.split('-');
             if (cmdId !== selectedCommodityId) return null;
             const region = regionalData[parseInt(strIdx, 10)];
             if (!region) return null;
             const regionalPrice = (currentCommodity?.price || 0) + region.priceAdjust;

             return (
              <InfoWindow
                position={{ lat: region.lat, lng: region.lng }}
                onCloseClick={() => setActiveMarker(null)}
              >
                <div className="p-2 min-w-[150px] text-gray-900">
                  <h3 className="font-bold text-[14px] text-neutral-900 mb-1">{region.location}</h3>
                  <p className="text-[15px] font-mono font-semibold text-brand-primary m-0">
                    {regionalPrice.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2 })}
                    <span className="text-[11px] text-neutral-500 ml-1">{currentCommodity?.unit}</span>
                  </p>
                  {region.priceAdjust !== 0 && (
                    <p className={`text-[11px] font-medium m-0 mt-1 ${region.priceAdjust > 0 ? "text-green-600" : "text-amber-600"}`}>
                      Basis: {region.priceAdjust > 0 ? "+" : ""}{region.priceAdjust} vs. CEPEA
                    </p>
                  )}
                </div>
              </InfoWindow>
             );
          })()}
        </GMap>
      </div>
    </div>
  );
}

export function CommodityMap({ 
  commodities, 
  lang 
}: { 
  commodities: any[]; 
  lang: string 
}) {
  const [selectedCommodityId, setSelectedCommodityId] = useState<string>(commodities[0]?.id || "soy");
  const [activeMarker, setActiveMarker] = useState<string | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return <div className="p-8 text-center text-error bg-error-light rounded-lg h-[500px] flex items-center justify-center border border-neutral-200 shadow-sm">
      Error loading Google Maps. Is the API key valid?
    </div>;
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapWithGoogle 
        commodities={commodities} 
        lang={lang} 
        selectedCommodityId={selectedCommodityId} 
        setSelectedCommodityId={setSelectedCommodityId}
        activeMarker={activeMarker}
        setActiveMarker={setActiveMarker}
      />
    </APIProvider>
  );
}
