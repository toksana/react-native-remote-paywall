import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  createPaywallClient,
  RemotePaywall,
  type PaywallDocument,
  type ResolvedProduct,
} from 'react-native-remote-paywall';

import bundledPaywall from '../../templates/example.json';

/**
 * Stands in for the store. A real host asks StoreKit, Play Billing or
 * RevenueCat here and hands back whatever they say — the SDK never parses a
 * product id and never sees a price it did not get from this callback.
 */
const MOCK_PRODUCTS: Record<string, ResolvedProduct> = {
  'com.example.app.pro.annual': {
    productId: 'com.example.app.pro.annual',
    price: '$39.99',
    period: 'year',
    pricePerUnit: '$3.33',
    trialLength: '7 days',
  },
  'com.example.app.pro.monthly': {
    productId: 'com.example.app.pro.monthly',
    price: '$5.99',
    period: 'month',
    trialLength: '3 days',
  },
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The client is created once, at module scope: it outlives every screen, which
 * is what lets `prefetch` run at app start and what keeps one fetch shared
 * across every mount of the paywall. `onDismiss` therefore needs a way back to
 * whichever screen is currently showing it.
 */
const dismiss = { current: (): void => {} };

const paywalls = createPaywallClient({
  // Documents are `${endpoint}/${id}.json` — here, the file committed under
  // example/assets/paywalls in this repo. Edit it, push, reopen the paywall.
  endpoint:
    'https://raw.githubusercontent.com/toksana/react-native-remote-paywall/main/example/assets/paywalls',

  // Shipped inside the binary: what a first launch with no network shows.
  // Deliberately different copy from the remote one, so it is obvious on
  // screen which of the two you are looking at.
  bundled: { default: bundledPaywall as unknown as PaywallDocument },

  // No `storage`, so this demo's cache is in-memory and dies with the
  // process. A real app passes AsyncStorage or MMKV — see the README.

  host: {
    resolveProducts: async (productIds) =>
      productIds
        .map((productId) => MOCK_PRODUCTS[productId])
        .filter((product): product is ResolvedProduct => product != null),

    onPurchase: async (productId) => {
      // Artificial latency so the busy lock is visible: the CTA dims and
      // stops responding for a second and a half, while ✕ keeps working.
      await delay(1500);
      Alert.alert('Purchase', productId);
    },

    onRestore: async () => {
      await delay(1500);
      Alert.alert('Restore', 'Nothing to restore from a mock store.');
    },

    onDismiss: () => dismiss.current(),

    onOpenURL: (url) => {
      Linking.openURL(url).catch((error: unknown) => {
        console.warn('[paywall] could not open', url, error);
      });
    },

    onEvent: (event) => console.log('[paywall]', event.name, event.payload),

    onError: (error) => console.warn('[paywall] nothing to show', error),
  },
});

// Warms the document, its products and its images before anyone opens the
// paywall. Failures are swallowed — startup warming never crashes an app.
paywalls.prefetch('default');

export default function App() {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    dismiss.current = () => setShowing(false);
  }, []);

  return (
    <View style={styles.host}>
      <StatusBar style="light" />
      {/* Manual top inset — RN's SafeAreaView is deprecated in 0.83. */}
      <View style={styles.inset}>
        {showing ? (
          <RemotePaywall
            client={paywalls}
            id="default"
            renderLoading={() => (
              <View style={styles.centered}>
                <ActivityIndicator color="#5B8CFF" />
              </View>
            )}
            renderError={(error) => (
              <View style={styles.centered}>
                <Text style={styles.errorText}>
                  No paywall to show.{'\n'}
                  {error instanceof Error ? error.message : String(error)}
                </Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.centered}>
            <Text style={styles.title}>RemotePaywall example</Text>
            <Text style={styles.body}>
              Online, this opens the document committed under
              example/assets/paywalls. Offline, it opens the copy bundled in the
              binary. The screen tells you which one you got.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => setShowing(true)}
              accessibilityRole="button"
            >
              <Text style={styles.ctaLabel}>Show paywall</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: '#0B0D12',
  },
  inset: {
    flex: 1,
    paddingTop: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    color: '#9CA3AF',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  cta: {
    backgroundColor: '#5B8CFF',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 28,
    marginTop: 28,
  },
  ctaLabel: {
    color: '#0B0D12',
    fontSize: 16,
    fontWeight: '700',
  },
});
