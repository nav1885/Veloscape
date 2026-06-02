import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './types';
import { useAuthStore } from '../store/authStore';
import { APP_SCHEME } from '../constants/config';

import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import RideStack from './RideStack';

const Root = createStackNavigator<RootStackParamList>();

// Deep link config — tells NavigationContainer to accept veloscape:// URLs
// so that the app resumes (not restarts) when Strava redirects back.
const linking = {
  prefixes: [`${APP_SCHEME}://`],
  // No screen mapping needed — we handle veloscape://connected manually
  // via Linking.addEventListener in StravaConnectWrapper.
  config: { screens: {} },
};

export default function RootNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <NavigationContainer linking={linking}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Root.Screen name="Auth" component={AuthStack} />
        ) : (
          <>
            <Root.Screen name="Main" component={MainTabs} />
            <Root.Screen
              name="Ride"
              component={RideStack}
              options={{ presentation: 'modal' }}
            />
          </>
        )}
      </Root.Navigator>
    </NavigationContainer>
  );
}
