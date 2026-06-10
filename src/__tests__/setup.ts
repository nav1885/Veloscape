/**
 * Jest setup — mock native modules that aren't available in Node.
 */

// expo-speech
jest.mock('expo-speech', () => ({
  speak: jest.fn((_text: string, opts?: { onDone?: () => void }) => {
    // Simulate async speech completion
    if (opts?.onDone) setTimeout(opts.onDone, 10);
  }),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn().mockResolvedValue(false),
}));

// expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync: jest.fn().mockResolvedValue({ remove: jest.fn() }),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  startGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  stopGeofencingAsync: jest.fn().mockResolvedValue(undefined),
  Accuracy: { BestForNavigation: 6, High: 4 },
  ActivityType: { Fitness: 3 },
  LocationGeofencingEventType: { Enter: 1, Exit: 2 },
}));

// expo-file-system (durable geofence state file)
jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
  File: jest.fn().mockImplementation(() => ({
    exists: false,
    text: jest.fn().mockResolvedValue('{}'),
    write: jest.fn(),
    delete: jest.fn(),
  })),
  Directory: jest.fn(),
}));

// expo-task-manager (defineTask runs at module load in the ride engine)
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));

// expo-keep-awake
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn(),
}));

// expo-av (background audio session + duck-focus silent clip)
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          playFromPositionAsync: jest.fn().mockResolvedValue(undefined),
          stopAsync: jest.fn().mockResolvedValue(undefined),
        },
      }),
    },
  },
  InterruptionModeIOS: { DuckOthers: 1 },
  InterruptionModeAndroid: { DuckOthers: 1 },
}));

// expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// expo-sqlite — mock drizzle db
jest.mock('../db/client', () => {
  const mockRun = jest.fn().mockReturnValue({ changes: 0 });
  const mockAll = jest.fn().mockReturnValue([]);
  const mockGet = jest.fn().mockReturnValue(undefined);

  const chainable = () => {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.from = jest.fn().mockReturnValue(chain);
    chain.where = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.insert = jest.fn().mockReturnValue(chain);
    chain.values = jest.fn().mockReturnValue(chain);
    chain.delete = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.set = jest.fn().mockReturnValue(chain);
    chain.onConflictDoUpdate = jest.fn().mockReturnValue(chain);
    chain.run = mockRun;
    chain.all = mockAll;
    chain.get = mockGet;
    return chain;
  };

  return {
    db: {
      select: jest.fn().mockImplementation(() => chainable()),
      insert: jest.fn().mockImplementation(() => chainable()),
      delete: jest.fn().mockImplementation(() => chainable()),
      update: jest.fn().mockImplementation(() => chainable()),
      run: mockRun,
    },
  };
});

// react-native
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34, select: (obj: any) => obj.android },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS' },
    request: jest.fn().mockResolvedValue('granted'),
  },
  StyleSheet: { create: (s: any) => s },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  RefreshControl: 'RefreshControl',
}));

// react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  SafeAreaProvider: 'SafeAreaProvider',
}));

// Silence console.log in tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
