import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Button,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {DocumentView, RNPdftron} from '@pdftron/react-native-pdf';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

type ReproDocument = {
  label: string;
  filename: string;
};

type WatermarkResultEvent = {
  nativeEvent: {
    success: boolean;
    reason?: string;
    pageCount?: number;
    lockWaitMs?: number;
    stampMs?: number;
    totalMs?: number;
  };
};

type ReproLogEvent = {
  nativeEvent: {
    level: string;
    message: string;
    elapsedMs?: number;
  };
};

const DOCUMENTS: ReproDocument[] = [
  {label: '6,154 pages (~20 MB)', filename: 'synthetic-6154-pages.pdf'},
  {label: '11,717 pages (~52 MB)', filename: 'synthetic-11717-pages.pdf'},
];

RNPdftron.initialize('');

function App(): React.JSX.Element {
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:8080');
  const [selected, setSelected] = useState<ReproDocument>(DOCUMENTS[0]);
  const [documentUrl, setDocumentUrl] = useState<string>();
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'failed'>(
    'idle',
  );
  const [message, setMessage] = useState('Choose a fixture and start the repro.');
  const [logs, setLogs] = useState<string[]>([]);
  const startedAt = useRef(0);

  const watermarkConfig = useMemo(
    () => ({
      lines: ['CONFIDENTIAL', 'synthetic.user@example.invalid', 'PTStamper repro'],
      opacity: 0.18,
      mode: 'tiledImage',
      tileWidth: 240,
      tileHeight: 96,
    }),
    [],
  );

  useEffect(() => {
    console.log(`[Repro] phase=${phase} message="${message}"`);
  }, [message, phase]);

  const appendLog = (entry: string) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    setLogs(current => [...current.slice(-7), `${timestamp} ${entry}`]);
    console.info(`[Repro] ${entry}`);
  };

  const start = (document: ReproDocument) => {
    const base = serverUrl.trim().replace(/\/+$/, '');
    startedAt.current = Date.now();
    setSelected(document);
    setPhase('loading');
    setLogs([]);
    setMessage('Downloading PDF. Display remains fail-closed until PTStamper succeeds.');
    setDocumentUrl(`${base}/${Date.now()}/${document.filename}`);
    appendLog(`INFO open requested: ${document.filename}`);
  };

  const onWatermarkResult = (event: WatermarkResultEvent) => {
    const result = event.nativeEvent;
    const jsElapsed = Date.now() - startedAt.current;
    console.log('[Repro] native watermark result', {...result, jsElapsed});
    appendLog(
      `${result.success ? 'INFO' : 'ERROR'} native result: pages=${
        result.pageCount ?? 0
      } lock=${result.lockWaitMs ?? 0}ms stamp=${result.stampMs ?? 0}ms`,
    );

    if (!result.success) {
      setPhase('failed');
      setMessage(`Watermark failed: ${result.reason || 'unknown native error'}`);
      return;
    }

    setPhase('ready');
    setMessage(
      `${result.pageCount?.toLocaleString()} pages stamped; lock ${result.lockWaitMs} ms, ` +
        `stamp ${result.stampMs} ms, total ${result.totalMs} ms (JS ${jsElapsed} ms).`,
    );
  };

  const onReproLog = (event: ReproLogEvent) => {
    const {level, message: nativeMessage, elapsedMs} = event.nativeEvent;
    appendLog(
      `${level.toUpperCase()} native: ${nativeMessage}${
        elapsedMs === undefined ? '' : ` (${Math.round(elapsedMs)}ms)`
      }`,
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.controls}>
          <Text style={styles.title}>iOS PTStamper large-document repro</Text>
          <TextInput
            accessibilityLabel="PDF server URL"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setServerUrl}
            style={styles.input}
            value={serverUrl}
          />
          <View style={styles.buttons}>
            {DOCUMENTS.map(document => (
              <View key={document.filename} style={styles.button}>
                <Button
                  title={document.label}
                  onPress={() => start(document)}
                />
              </View>
            ))}
          </View>
          <Text style={styles.status}>
            {selected.label}: {message}
          </Text>
          <Text style={styles.profile}>
            Contention profile: active stream + DocLock + tiled StampImage
          </Text>
          {logs.map((entry, index) => (
            <Text key={`${index}-${entry}`} style={styles.log}>
              {entry}
            </Text>
          ))}
        </View>

        <View style={styles.viewerFrame}>
          {documentUrl ? (
            <DocumentView
              key={documentUrl}
              openUrlPath="__fresh_repro_cache__"
              watermarkConfig={watermarkConfig}
              document={documentUrl}
              readOnly
              topToolbarEnabled={false}
              bottomToolbarEnabled={false}
              onDocumentLoaded={() => {
                appendLog('INFO wrapper: onDocumentLoaded');
                console.log(
                  `[Repro] onDocumentLoaded +${Math.round(
                    Date.now() - startedAt.current,
                  )}ms`,
                );
              }}
              onDocumentError={(error: string) => {
                appendLog(`ERROR document: ${error}`);
                setPhase('failed');
                setMessage(`Document load failed: ${error}`);
              }}
              onReproLog={onReproLog}
              onWatermarkResult={onWatermarkResult}
              style={phase === 'ready' ? styles.viewer : styles.concealedViewer}
            />
          ) : null}

          {phase !== 'ready' ? (
            <View style={styles.failClosed}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.failClosedTitle}>Document concealed</Text>
              <Text style={styles.failClosedText}>
                {phase === 'failed'
                  ? message
                  : 'Waiting for native watermark confirmation.'}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {backgroundColor: '#f4f6f8', flex: 1},
  controls: {gap: 10, padding: 14},
  title: {color: '#17202a', fontSize: 20, fontWeight: '700'},
  input: {
    backgroundColor: 'white',
    borderColor: '#aeb6bf',
    borderRadius: 6,
    borderWidth: 1,
    color: '#17202a',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  buttons: {flexDirection: 'row', gap: 8},
  button: {flex: 1},
  status: {color: '#34495e', fontSize: 12},
  profile: {color: '#922b21', fontSize: 11, fontWeight: '600'},
  log: {color: '#566573', fontFamily: 'Menlo', fontSize: 10},
  viewerFrame: {backgroundColor: '#1c2833', flex: 1},
  viewer: {flex: 1, opacity: 1},
  concealedViewer: {flex: 1, opacity: 0},
  failClosed: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#1c2833',
    justifyContent: 'center',
    padding: 30,
  },
  lockIcon: {fontSize: 42},
  failClosedTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  failClosedText: {
    color: '#d5d8dc',
    marginTop: 8,
    textAlign: 'center',
  },
});

export default App;
