import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from './types';
import { colors } from '../constants/colors';

import HomeTab from '../screens/HomeTab';
import SegmentsScreen from '../screens/SegmentsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_BAR_HEIGHT = 64;
const ICON_SIZE = 34;

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Segments: { active: 'navigate', inactive: 'navigate-outline' },
  History: { active: 'time', inactive: 'time-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' },
};

function TabIcon({ label, focused, isLast }: { label: string; focused: boolean; isLast: boolean }) {
  const cfg = TAB_ICONS[label];
  const name = focused ? cfg.active : cfg.inactive;
  return (
    <View
      style={{
        flex: 1,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderRightColor: colors.borderMuted,
      }}
    >
      <Ionicons name={name} size={ICON_SIZE} color={focused ? colors.gold : colors.textDim} />
    </View>
  );
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom;
  const tabNames: Array<keyof MainTabParamList> = ['Home', 'Segments', 'History', 'Settings'];

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon
            label={route.name}
            focused={focused}
            isLast={route.name === tabNames[tabNames.length - 1]}
          />
        ),
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textDim,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderMuted,
          borderTopWidth: 1,
          paddingBottom: bottomPad,
          paddingTop: 0,
          height: TAB_BAR_HEIGHT + bottomPad,
        },
        tabBarItemStyle: {
          padding: 0,
          height: TAB_BAR_HEIGHT,
        },
        tabBarIconStyle: {
          width: '100%',
          height: '100%',
          margin: 0,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Segments" component={SegmentsScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
