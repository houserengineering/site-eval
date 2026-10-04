import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles.css';

// The office PC's one-time Dropbox connection (apps/site-eval-review-service, connect-dropbox) has Dropbox return here,
// to the app's registered address; hand the code on to the office PC's own listener. It is useless without the PC's
// PKCE verifier.
const params = new URLSearchParams(location.search);
const office = /^office-connect\.(\d{4,5})\.[\w-]+$/.exec(params.get('state') ?? '');
if (office) location.replace(`http://127.0.0.1:${office[1]}/callback${location.search}`);
else {
  registerSW({ immediate: true });
  render(<App />, document.getElementById('app')!);
}
