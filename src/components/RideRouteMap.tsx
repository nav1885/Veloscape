/**
 * RideRouteMap — the ride's full GPS track as one gold polyline.
 *
 * Rendered with Leaflet + OpenStreetMap (CartoDB dark tiles) inside a WebView.
 * This is deliberately NOT react-native-maps: on Android that requires a Google
 * Maps API key and hard-crashes without one. Leaflet/OSM needs no key and looks
 * identical (dark) on iOS and Android.
 *
 * The map shows ONLY the ride line. When a segment is selected, its slice of the
 * ride line is passed as `highlight` and drawn brighter/thicker on top while the
 * base route dims (updated via injectJavaScript, no tile reload). Empty `track`
 * → "Route not recorded" placeholder.
 *
 * Note: tiles + Leaflet load from CDN, so the map needs network the first time.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../constants/colors';
import type { LatLng } from '../utils/polyline';

function buildHtml(track: LatLng[]): string {
  const route = JSON.stringify(track.map(p => [p.lat, p.lng]));
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{height:100%;margin:0;background:#15171c}</style>
</head><body><div id="m"></div><script>
var map=L.map('m',{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,boxZoom:false,keyboard:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var route=${route};
var rl=L.polyline(route,{color:'#F5C842',weight:4,lineJoin:'round',lineCap:'round'}).addTo(map);
function fit(){try{map.invalidateSize();map.fitBounds(rl.getBounds(),{padding:[26,26],maxZoom:15});}catch(e){}}
fit();
setTimeout(fit,150);
setTimeout(fit,500);
var hl=null;
window.setHi=function(coords){
  if(hl){map.removeLayer(hl);hl=null;}
  if(coords&&coords.length>1){rl.setStyle({color:'rgba(245,200,66,0.30)'});hl=L.polyline(coords,{color:'#ffffff',weight:6,lineJoin:'round',lineCap:'round'}).addTo(map);}
  else{rl.setStyle({color:'#F5C842'});}
};
</script></body></html>`;
}

interface Props {
  track: LatLng[];
  highlight?: LatLng[] | null;
  style?: ViewStyle;
}

export default function RideRouteMap({ track, highlight, style }: Props) {
  const ref = useRef<WebView>(null);
  const loadedRef = useRef(false);

  const html = useMemo(() => buildHtml(track), [track]);

  const applyHighlight = () => {
    const hi = (highlight ?? []).map(p => [p.lat, p.lng]);
    ref.current?.injectJavaScript(`window.setHi && window.setHi(${JSON.stringify(hi)}); true;`);
  };

  useEffect(() => {
    if (loadedRef.current) applyHighlight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  if (!track || track.length < 2) {
    return (
      <View style={[styles.empty, style]}>
        <Text style={styles.emptyTitle}>Route not recorded</Text>
        <Text style={styles.emptySub}>This ride had no GPS track.</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={ref}
      style={[styles.map, style]}
      originWhitelist={['*']}
      source={{ html }}
      scrollEnabled={false}
      javaScriptEnabled
      domStorageEnabled
      androidLayerType="hardware"
      pointerEvents="none"
      onLoadEnd={() => { loadedRef.current = true; applyHighlight(); }}
    />
  );
}

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.mapBg },
  empty: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  emptySub: { fontSize: 12, color: colors.textMuted },
});
