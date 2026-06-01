/**
 * RouteThumbnail — tiny SVG route-shape glyph for feed tiles.
 *
 * Draws just the route outline (no basemap, no WebView) so it's cheap enough to
 * render once per row in a scrolling list. Coordinates are projected to the box
 * with a uniform scale (aspect-preserving) and north-up. No coords → a muted
 * placeholder box.
 */
import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';
import type { LatLng } from '../utils/polyline';

interface Props {
  coords?: LatLng[];
  width?: number;
  height?: number;
  style?: ViewStyle;
}

export default function RouteThumbnail({ coords, width = 64, height = 48, style }: Props) {
  const points = coords && coords.length >= 2 ? project(coords, width, height) : null;
  return (
    <View style={[styles.box, { width, height }, style]}>
      {points ? (
        <Svg width={width} height={height}>
          <Polyline
            points={points}
            fill="none"
            stroke={colors.gold}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

function project(coords: LatLng[], w: number, h: number): string {
  const pad = 5;
  const lats = coords.map(c => c.lat);
  const lngs = coords.map(c => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const spanLng = Math.max(maxLng - minLng, 1e-6);
  // Uniform scale so the route keeps its real proportions; then center it.
  const s = Math.min((w - 2 * pad) / spanLng, (h - 2 * pad) / spanLat);
  const offX = (w - spanLng * s) / 2;
  const offY = (h - spanLat * s) / 2;
  return coords
    .map(c => {
      const x = offX + (c.lng - minLng) * s;
      const y = h - (offY + (c.lat - minLat) * s); // invert: north up
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
