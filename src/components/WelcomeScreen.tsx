import React from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';

// TODO: replace with actual navigation prop type
interface Props {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export default function WelcomeScreen({ onGetStarted, onSignIn }: Props) {
  return (
    <View style={styles.container}>
      {/* TODO: replace with actual hero image */}
      <ImageBackground
        source={require('../../assets/hero-mtb.png')}
        style={styles.hero}
        imageStyle={styles.heroImage}
      >
        <LinearGradient
          colors={['rgba(28,28,30,0.1)', 'rgba(28,28,30,0.2)', 'rgba(28,28,30,0.92)', 'rgba(28,28,30,1)']}
          locations={[0, 0.4, 0.78, 1]}
          style={styles.gradient}
        />
      </ImageBackground>

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* TODO: replace with <Image> of sherpaa_logo.png if switching to image logo */}
          <Text style={styles.logo}>Veloscape</Text>
          <Text style={styles.tagline}>The only coach who was there last time.</Text>

          <TouchableOpacity style={styles.btnGold} onPress={onGetStarted} activeOpacity={0.85}>
            <Text style={styles.btnGoldText}>Get Started</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onSignIn} activeOpacity={0.7}>
            <Text style={styles.btnGhost}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D0D0D0', // base for mix-blend-mode effect on hero
  },
  hero: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImage: {
    // TODO: iOS doesn't support mix-blend-mode natively — use BlendMode or a shader
    // Workaround: pre-process image with white removed, or use a tinted overlay
    resizeMode: 'cover',
    top: 30,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.gold,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(240,240,240,0.75)',
    textAlign: 'center',
    marginBottom: 40,
  },
  btnGold: {
    width: '100%',
    height: 56,
    backgroundColor: colors.gold,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  btnGoldText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textOnGold,
  },
  btnGhost: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textFaint,
    textAlign: 'center',
  },
});
