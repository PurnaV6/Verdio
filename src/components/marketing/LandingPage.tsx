import {
  ArrowRight, BarChart3, BrainCircuit, Check, Database,
  LineChart, LockKeyhole, Network, Play, ShieldCheck, Sparkles,
} from "lucide-react";

type LandingPageProps = {
  onDemo: () => void;
  onLogin: () => void;
  onSignup: () => void;
};

export default function LandingPage({ onDemo, onLogin, onSignup }: LandingPageProps) {
  return (
    <div className="marketing-site">
      <header className="marketing-nav">
        <a href="/" className="marketing-brand" aria-label="Verd.io home">
          <span>V</span>
          <strong>Verd.io</strong>
        </a>
        <nav aria-label="Public navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#early-access">Early access</a>
        </nav>
        <div className="marketing-nav-actions">
          <button className="marketing-login" onClick={onLogin}>Log in</button>
          <button className="marketing-primary" onClick={onSignup}>Create free account <ArrowRight size={14}/></button>
        </div>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <div className="marketing-badge"><Sparkles size={13}/> Free during early access</div>
            <h1>Turn operational data into <span>decisions your team can act on.</span></h1>
            <p>Verd.io connects sales, stock and financial data to surface forecasts, risks and prioritised actions—without requiring a data science team.</p>
            <div className="marketing-hero-actions">
              <button className="marketing-primary is-large" onClick={onSignup}>Start free <ArrowRight size={16}/></button>
              <button className="marketing-demo-button" onClick={onDemo}><span><Play size={14} fill="currentColor"/></span> View live demo</button>
            </div>
            <div className="marketing-trust-row">
              <span><Check size={13}/> No card required</span>
              <span><Check size={13}/> Secure workspace</span>
              <span><Check size={13}/> CSV and Excel ready</span>
            </div>
          </div>

          <div className="marketing-product-preview" aria-label="Verd.io executive workspace preview">
            <div className="preview-window-bar"><i/><i/><i/><span>Executive Workspace</span><em>Live</em></div>
            <div className="preview-layout">
              <aside>
                <div className="preview-mini-brand"><span>V</span><b>Verd.io</b></div>
                <small>WORKSPACE</small>
                <div className="is-active"><BarChart3 size={13}/> Executive</div>
                <div><LineChart size={13}/> Predictions</div>
                <div><ShieldCheck size={13}/> Risks</div>
                <small>DATA</small>
                <div><Database size={13}/> Data Hub</div>
              </aside>
              <div className="preview-content">
                <div className="preview-heading"><div><small>MONDAY'S DECISION BRIEF</small><b>Good morning.</b></div><span>82<small>/100</small></span></div>
                <div className="preview-brief"><small>PRIORITY 01</small><b>Prepare inventory capacity for projected demand.</b><p>Three products require additional coverage before the next operating period.</p></div>
                <div className="preview-kpis"><div><small>REVENUE</small><b>£3.29m</b><span>+12.4%</span></div><div><small>FORECAST</small><b>£418k</b><span>Next period</span></div><div><small>CONFIDENCE</small><b>96%</b><span>Decision ready</span></div></div>
                <div className="preview-chart"><div><small>REVENUE TREND</small><b>Commercial momentum</b></div><div className="preview-bars">{[35,48,41,62,58,73,68,86,78,91,84,96].map((height,index)=><i key={index} style={{height:`${height}%`}}/>)}</div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-proof" aria-label="Verd.io product qualities">
          <span>DECISION-LED ANALYTICS</span>
          <span>EXPLAINABLE FORECASTS</span>
          <span>CONNECTED DATA</span>
          <span>EXECUTIVE REPORTING</span>
        </section>

        <section id="product" className="marketing-features">
          <div className="marketing-section-heading"><div className="marketing-badge">Built for business decisions</div><h2>One workspace from raw data to accountable action.</h2><p>Verd.io brings the analytical workflow together so leaders can move from evidence to execution without switching tools.</p></div>
          <div className="marketing-feature-grid">
            <article><span><Network size={19}/></span><h3>Connect business data</h3><p>Upload sales, stock, customer and finance files together. Verd.io identifies governed relationships across them.</p><small>DATA HUB</small></article>
            <article><span><BrainCircuit size={19}/></span><h3>See what matters</h3><p>Receive prioritised risks, opportunities and recommendations grounded in your actual operating data.</p><small>DECISION INTELLIGENCE</small></article>
            <article><span><LineChart size={19}/></span><h3>Plan what comes next</h3><p>Use forecasts and scenarios to prepare inventory, capacity and commercial plans with confidence.</p><small>PREDICTIONS</small></article>
          </div>
        </section>

        <section id="how-it-works" className="marketing-workflow">
          <div><div className="marketing-badge">How it works</div><h2>From spreadsheet to executive brief in minutes.</h2></div>
          <ol>
            <li><span>01</span><div><b>Upload your data</b><p>Use one file or connect multiple organisational datasets.</p></div></li>
            <li><span>02</span><div><b>Confirm the context</b><p>Review detected roles, primary sources and data relationships.</p></div></li>
            <li><span>03</span><div><b>Act on the evidence</b><p>Explore KPIs, forecasts, risks and recommended actions.</p></div></li>
          </ol>
        </section>

        <section id="early-access" className="marketing-early-access">
          <div>
            <div className="marketing-badge"><Sparkles size={13}/> Early access</div>
            <h2>Use the complete Verd.io workspace free.</h2>
            <p>Explore the product, analyse your business data and save decision workspaces at no cost during early access. Paid subscriptions will be introduced later with clear notice.</p>
            <ul><li><Check size={14}/> Full analytical workspace</li><li><Check size={14}/> AI Advisor and forecasts</li><li><Check size={14}/> Reports and saved projects</li></ul>
          </div>
          <aside>
            <small>EARLY ACCESS PLAN</small>
            <b>Free</b>
            <p>No payment card required</p>
            <button className="marketing-primary is-block" onClick={onSignup}>Create free account <ArrowRight size={15}/></button>
            <button className="marketing-demo-link" onClick={onDemo}>Or view the live demo</button>
          </aside>
        </section>

        <section className="marketing-security">
          <LockKeyhole size={20}/><div><b>Private by design</b><p>Your workspace is protected by authenticated access and row-level data controls.</p></div>
          <ShieldCheck size={20}/><div><b>Explainable by default</b><p>Recommendations retain supporting evidence, assumptions and source context.</p></div>
        </section>
      </main>

      <footer className="marketing-footer">
        <div className="marketing-brand"><span>V</span><strong>Verd.io</strong></div>
        <p>Decision intelligence for growing organisations.</p>
        <div><button onClick={onLogin}>Log in</button><button onClick={onSignup}>Create account</button></div>
      </footer>
    </div>
  );
}
