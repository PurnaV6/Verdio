import { ArrowRight } from "lucide-react";

type LandingPageProps = {
  onDemo: () => void;
  onLogin: () => void;
  onSignup: () => void;
};

// Real figures from the built-in sample business file (720 rows, Jan 24 to Dec 25): the last 12 months of sales.
const SAMPLE_MONTHS = [
  { label: 'Jan 25', value: 139805 }, { label: 'Feb 25', value: 154028 }, { label: 'Mar 25', value: 152588 }, { label: 'Apr 25', value: 139584 },
  { label: 'May 25', value: 185091 }, { label: 'Jun 25', value: 151127 }, { label: 'Jul 25', value: 149646 }, { label: 'Aug 25', value: 170278 },
  { label: 'Sep 25', value: 149249 }, { label: 'Oct 25', value: 150261 }, { label: 'Nov 25', value: 156446 }, { label: 'Dec 25', value: 148960 },
];
const SAMPLE_MAX = Math.max(...SAMPLE_MONTHS.map(m => m.value));
const SAMPLE_MIN = Math.min(...SAMPLE_MONTHS.map(m => m.value));
const SAMPLE_HEALTH = 95;
const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

export default function LandingPage({ onDemo, onLogin, onSignup }: LandingPageProps) {
  return (
    <div className="v2-site">
      <a className="v2-skip" href="#main">Skip to main content</a>
      <header className="v2-nav">
        <div className="v2-wrap v2-nav-inner">
          <a href="/" className="v2-brand" aria-label="Verd.io home"><span className="v2-brand-chip" aria-hidden="true">V</span><span className="v2-mark">Verd<i>.</i>io</span></a>
          <nav aria-label="Public navigation" className="v2-nav-links">
            <a href="#product">Product</a>
            <a href="#how-it-works">How it works</a>
            <a href="#early-access">Early access</a>
          </nav>
          <div className="v2-nav-actions">
            <button type="button" className="v2-link-button" onClick={onLogin}>Log in</button>
            <button type="button" className="v2-btn is-small" onClick={onSignup}>Create free account <ArrowRight size={14} aria-hidden="true"/></button>
          </div>
        </div>
      </header>

      <main id="main">
        <div className="v2-wrap">
          <section className="v2-hero">
            <div className="v2-hero-copy">
              <p className="v2-pill">Free during early access</p>
              <h1>Turn operational data into <em>decisions your team can act on.</em></h1>
              <p className="v2-land-lede">Verd.io connects sales, stock and financial data to surface forecasts, risks and prioritised actions, without requiring a data science team.</p>
              <div className="v2-ctas">
                <button type="button" className="v2-btn is-large" onClick={onSignup}>Start free <ArrowRight size={16} aria-hidden="true"/></button>
                <button type="button" className="v2-btn is-quiet is-large" onClick={onDemo}>View live demo</button>
              </div>
              <ul className="v2-assure">
                <li>No card required</li>
                <li>Secure workspace</li>
                <li>CSV and Excel ready</li>
              </ul>
            </div>

            <figure className="v2-mock" aria-label="Verd.io executive workspace, shown with the sample business file">
              <div className="v2-mock-bar"><span>Executive Workspace</span><em>Sample business</em></div>
              <div className="v2-mock-body">
                <div className="v2-mock-rail" aria-hidden="true">
                  <div className="v2-mock-brand"><b>V</b><span>Verd.io</span></div>
                  <small>Workspace</small>
                  <div className="is-active"><i/>Executive</div>
                  <div><i/>Execution</div>
                  <small>Intelligence</small>
                  <div><i/>Predictions</div>
                  <div><i/>Risks</div>
                  <small>Data</small>
                  <div><i/>Data Hub</div>
                </div>
                <div className="v2-mock-main">
                  <div className="v2-mock-head">
                    <div><small>Executive workspace</small><b>Good morning.</b></div>
                    <svg className="v2-mock-ring" width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Business health ${SAMPLE_HEALTH} out of 100, strong`}>
                      <circle cx="38" cy="38" r={RING_R} fill="none" strokeWidth="7" className="v2-mock-ring-track"/>
                      <circle cx="38" cy="38" r={RING_R} fill="none" strokeWidth="7" strokeLinecap="round" className="v2-mock-ring-arc" strokeDasharray={`${(RING_C * SAMPLE_HEALTH) / 100} ${RING_C}`} transform="rotate(-90 38 38)"/>
                      <text x="38" y="43" textAnchor="middle" className="v2-mock-ring-num">{SAMPLE_HEALTH}</text>
                    </svg>
                  </div>
                  <div className="v2-mock-brief"><small>Priority 01</small><b>Re-engage 45 at-risk or lapsed customers.</b><p>Planning estimate of about £42,011, to start this month.</p></div>
                  <div className="v2-mock-kpis">
                    <div><small>Total sales</small><b>£3.29m</b><span>24 months</span></div>
                    <div><small>Next month</small><b>£163.5k</b><span>Jan 26 forecast</span></div>
                    <div><small>Data quality</small><b>100<span> /100</span></b><span>Quality check</span></div>
                  </div>
                  <div className="v2-mock-chart">
                    <div><small>Monthly sales</small><b>Jan 25 to Dec 25</b></div>
                    <div className="v2-mock-bars" role="img" aria-label={`Monthly sales for the last 12 months, from £${SAMPLE_MIN.toLocaleString('en-GB')} to £${SAMPLE_MAX.toLocaleString('en-GB')}`}>
                      {SAMPLE_MONTHS.map(m => <i key={m.label} style={{ height: `${Math.round((m.value / SAMPLE_MAX) * 100)}%` }}/>)}
                    </div>
                  </div>
                </div>
              </div>
              <figcaption className="v2-mock-note">Real figures from the sample business file: 720 rows, Jan 24 to Dec 25.</figcaption>
            </figure>
          </section>

          <ul className="v2-proof" aria-label="Verd.io product qualities">
            <li>Decision-led analytics</li>
            <li>Explainable forecasts</li>
            <li>Connected data</li>
            <li>Executive reporting</li>
          </ul>

          <section id="product" className="v2-section is-centered">
            <div className="v2-section-head">
              <p className="v2-pill">Built for business decisions</p>
              <h2>One workspace from raw data to accountable action.</h2>
              <p className="v2-sub">Verd.io brings the analytical workflow together so leaders can move from evidence to execution without switching tools.</p>
            </div>
            <ul className="v2-land-ledger is-panel">
              <li><span className="v2-k">Data hub</span><div><h3>Connect business data</h3><p>Upload sales, stock, customer and finance files together. Verd.io identifies governed relationships across them.</p></div></li>
              <li><span className="v2-k">Decision intelligence</span><div><h3>See what matters</h3><p>Receive prioritised risks, opportunities and recommendations grounded in your actual operating data.</p></div></li>
              <li><span className="v2-k">Predictions</span><div><h3>Plan what comes next</h3><p>Use forecasts and scenarios to prepare inventory, capacity and commercial plans with confidence.</p></div></li>
            </ul>
          </section>

          <section id="how-it-works" className="v2-section">
            <div>
              <p className="v2-pill">How it works</p>
              <h2>From spreadsheet to executive brief in minutes.</h2>
            </div>
            <ol className="v2-land-ledger is-numbered">
              <li><span className="v2-n">01</span><div><h3>Upload your data</h3><p>Use one file or connect multiple organisational datasets.</p></div></li>
              <li><span className="v2-n">02</span><div><h3>Confirm the context</h3><p>Review detected roles, primary sources and data relationships.</p></div></li>
              <li><span className="v2-n">03</span><div><h3>Act on the evidence</h3><p>Explore KPIs, forecasts, risks and recommended actions.</p></div></li>
            </ol>
          </section>

          <section id="early-access" className="v2-access">
            <div>
              <p className="v2-pill">Early access</p>
              <h2>Use the complete Verd.io workspace free.</h2>
              <p>Explore the product, analyse your business data and save decision workspaces at no cost during early access. Paid subscriptions will be introduced later with clear notice.</p>
              <ul className="v2-assure">
                <li>Full analytical workspace</li>
                <li>AI Advisor and forecasts</li>
                <li>Reports and saved projects</li>
              </ul>
            </div>
            <aside className="v2-plan" aria-label="Early access plan">
              <span className="v2-land-tag">Early access plan</span>
              <div className="v2-price">Free</div>
              <span className="v2-land-tag">No payment card required</span>
              <button type="button" className="v2-btn is-block" onClick={onSignup}>Create free account <ArrowRight size={16} aria-hidden="true"/></button>
              <button type="button" className="v2-link-button is-center" onClick={onDemo}>Or view the live demo</button>
            </aside>
          </section>

          <section className="v2-twin" aria-label="Privacy and explainability">
            <div><h3>Private by design</h3><p>Your workspace is protected by authenticated access and row-level data controls.</p></div>
            <div><h3>Explainable by default</h3><p>Recommendations retain supporting evidence, assumptions and source context.</p></div>
          </section>
        </div>
      </main>

      <footer className="v2-footer">
        <div className="v2-wrap v2-footer-inner">
          <span className="v2-brand"><span className="v2-brand-chip" aria-hidden="true">V</span><span className="v2-mark">Verd<i>.</i>io</span></span>
          <p>Decision intelligence for growing organisations.</p>
          <div className="v2-footer-actions">
            <button type="button" className="v2-link-button" onClick={onLogin}>Log in</button>
            <button type="button" className="v2-link-button" onClick={onSignup}>Create account</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
