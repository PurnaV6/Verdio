import { ArrowRight } from "lucide-react";

type LandingPageProps = {
  onDemo: () => void;
  onLogin: () => void;
  onSignup: () => void;
};

export default function LandingPage({ onDemo, onLogin, onSignup }: LandingPageProps) {
  return (
    <div className="v2-site">
      <a className="v2-skip" href="#main">Skip to main content</a>
      <header className="v2-nav">
        <div className="v2-wrap v2-nav-inner">
          <a href="/" className="v2-mark" aria-label="Verd.io home">Verd<i>.</i>io</a>
          <nav aria-label="Public navigation" className="v2-nav-links">
            <a href="#product">Product</a>
            <a href="#how-it-works">How it works</a>
            <a href="#early-access">Early access</a>
          </nav>
          <div className="v2-nav-actions">
            <button type="button" className="v2-link-button" onClick={onLogin}>Log in</button>
            <button type="button" className="v2-btn is-small" onClick={onSignup}>Create free account</button>
          </div>
        </div>
      </header>

      <main id="main">
        <div className="v2-wrap">
          <section className="v2-hero">
            <div className="v2-hero-copy">
              <p className="v2-eyebrow">Free during early access</p>
              <h1>Turn operational data into decisions your team <em>can act on.</em></h1>
              <p className="v2-lede">Verd.io connects sales, stock and financial data to surface forecasts, risks and prioritised actions—without requiring a data science team.</p>
              <div className="v2-ctas">
                <button type="button" className="v2-btn" onClick={onSignup}>Start free <ArrowRight size={16} aria-hidden="true"/></button>
                <button type="button" className="v2-btn is-quiet" onClick={onDemo}>View live demo</button>
              </div>
              <ul className="v2-assure">
                <li>No card required</li>
                <li>Secure workspace</li>
                <li>CSV and Excel ready</li>
              </ul>
            </div>

            <article className="v2-brief" aria-label="Sample decision brief, illustrative sample data">
              <div className="v2-brief-head">
                <strong>Monday&rsquo;s decision brief</strong>
                <span className="v2-tag">Sample business &middot; illustrative</span>
              </div>
              <h2>Prepare inventory capacity for projected demand.</h2>
              <p className="v2-why">Three products require additional coverage before the next operating period.</p>
              <ul className="v2-rows">
                <li><span className="v2-lab">Business health</span><span className="v2-fig">82<span className="v2-tag"> /100</span></span><span className="v2-src v2-tag"><b>sample.csv</b> &middot; 4 pillars &middot; scored</span></li>
                <li><span className="v2-lab">Revenue</span><span className="v2-fig">£3.29m</span><span className="v2-src v2-tag"><b>sample.csv</b> &middot; revenue &middot; +12.4% vs prior period</span></li>
                <li><span className="v2-lab">Forecast, next period</span><span className="v2-fig">£418k</span><span className="v2-src v2-tag"><b>sample.csv</b> &middot; trend model</span></li>
              </ul>
              <p className="v2-note">Illustrative sample data. Every figure names its source.</p>
            </article>
          </section>

          <ul className="v2-proof" aria-label="Verd.io product qualities">
            <li>Decision-led analytics</li>
            <li>Explainable forecasts</li>
            <li>Connected data</li>
            <li>Executive reporting</li>
          </ul>

          <section id="product" className="v2-section">
            <div>
              <p className="v2-kick">Built for business decisions</p>
              <h2>One workspace from raw data to accountable action.</h2>
              <p className="v2-sub">Verd.io brings the analytical workflow together so leaders can move from evidence to execution without switching tools.</p>
            </div>
            <ul className="v2-ledger">
              <li><div><span className="v2-k">Data hub</span><h3>Connect business data</h3><p>Upload sales, stock, customer and finance files together. Verd.io identifies governed relationships across them.</p></div></li>
              <li><div><span className="v2-k">Decision intelligence</span><h3>See what matters</h3><p>Receive prioritised risks, opportunities and recommendations grounded in your actual operating data.</p></div></li>
              <li><div><span className="v2-k">Predictions</span><h3>Plan what comes next</h3><p>Use forecasts and scenarios to prepare inventory, capacity and commercial plans with confidence.</p></div></li>
            </ul>
          </section>

          <section id="how-it-works" className="v2-section">
            <div>
              <p className="v2-kick">How it works</p>
              <h2>From spreadsheet to executive brief in minutes.</h2>
            </div>
            <ol className="v2-ledger is-numbered">
              <li><span className="v2-n">01</span><div><h3>Upload your data</h3><p>Use one file or connect multiple organisational datasets.</p></div></li>
              <li><span className="v2-n">02</span><div><h3>Confirm the context</h3><p>Review detected roles, primary sources and data relationships.</p></div></li>
              <li><span className="v2-n">03</span><div><h3>Act on the evidence</h3><p>Explore KPIs, forecasts, risks and recommended actions.</p></div></li>
            </ol>
          </section>

          <section id="early-access" className="v2-access">
            <div>
              <p className="v2-eyebrow">Early access</p>
              <h2>Use the complete Verd.io workspace free.</h2>
              <p>Explore the product, analyse your business data and save decision workspaces at no cost during early access. Paid subscriptions will be introduced later with clear notice.</p>
              <button type="button" className="v2-btn is-quiet" onClick={onDemo}>Or view the live demo</button>
            </div>
            <aside className="v2-plan" aria-label="Early access plan">
              <span className="v2-tag">Early access plan</span>
              <div className="v2-price">Free</div>
              <span className="v2-tag">No payment card required</span>
              <ul>
                <li>Full analytical workspace</li>
                <li>AI Advisor and forecasts</li>
                <li>Reports and saved projects</li>
              </ul>
              <button type="button" className="v2-btn is-block" onClick={onSignup}>Create free account <ArrowRight size={16} aria-hidden="true"/></button>
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
          <span className="v2-mark">Verd<i>.</i>io</span>
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
