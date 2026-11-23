import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Kicker } from '../components/ui'

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: 'cube', title: '3D product viewer', body: 'Rotate, zoom and see every side. Tap hotspots for materials, switch on true dimensions in cm.' },
  { icon: 'ar', title: 'AR in your room', body: 'Place the piece on your floor at real size, on Android and iPhone, straight from the website. No app.' },
  { icon: 'ruler', title: 'AI room measurement', body: 'Measure with the phone in AR, or from one photo with a sheet of A4 paper. An on-device depth model suggests the corners.' },
  { icon: 'wand', title: 'Intelligent placement', body: 'A constraint optimiser lays the room out for you: walkways, door swings, windows, the sofa facing the TV.' },
  { icon: 'door', title: 'Will it fit, and will it get in?', body: 'A fit score for your room plus a delivery-path check through doors, corridor corners, stairs and the lift.' },
  { icon: 'truck', title: 'Delivery cost, upfront', body: 'City to city, the right vehicle, stairs without a lift and assembly, in rupees, before you order.' },
  { icon: 'palette', title: 'Live customization', body: 'Size, fabric and colour change on the 3D model instantly, with the price worked out as you go.' },
  { icon: 'sparkle', title: 'Recommendations that fit', body: 'Suggestions that fit the free space, your budget, the style and the colours of your actual room.' },
  { icon: 'chart', title: 'Store dashboard', body: 'Upload products and 3D models, set delivery rules, and see which products shoppers tried, fitted and asked for.' },
]

const steps = [
  { n: '01', title: 'Upload your catalogue', body: 'Add products, sizes, finishes and a 3D model in the dashboard.' },
  { n: '02', title: 'Paste two lines', body: 'Add the script and one tag to your product page template.' },
  { n: '03', title: 'Shoppers see it at home', body: 'They measure, place, check the fit and the delivery cost, then send you the configuration.' },
]

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 text-sm font-semibold sm:gap-2">
            <a href="#features" className="hidden rounded-full px-3 py-2 text-ink-2 hover:text-ink sm:inline">Features</a>
            <a href="#engine" className="hidden rounded-full px-3 py-2 text-ink-2 hover:text-ink sm:inline">Spatial engine</a>
            <Link to="/dashboard" className="hidden rounded-full px-3 py-2 text-ink-2 hover:text-ink min-[400px]:inline">Dashboard</Link>
            <Link to="/demo/shahi" className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-paper hover:bg-ink-2">Live demo</Link>
          </nav>
        </div>
      </header>

      <div className="border-b border-line bg-paper-2/70">
        <p className="mx-auto max-w-6xl px-4 py-3 text-center text-[26px] leading-snug text-ink-2 sm:px-6">
          Project made under the supervision of <strong className="whitespace-nowrap font-semibold text-ink">Dr Amir Rasheed</strong>
        </p>
      </div>

      <main>
        {/* hero */}
        <section className="grid-paper border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.05fr_1fr] md:py-20">
            <div>
              <Kicker>3D · AR · AI room fit for furniture websites</Kicker>
              <h1 className="mt-4 text-[2.6rem] leading-[1.05] text-ink sm:text-6xl">
                See it in your room <em className="text-clay not-italic">before</em> you buy it.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
                RoomSense measures the shopper's room, places the furniture where it belongs, checks that it fits and that it can be
                delivered through the door, and prices the delivery. Any furniture website adds it with two lines of code.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/demo/shahi" className="inline-flex h-12 items-center gap-2 rounded-full bg-clay px-6 font-semibold text-white shadow-soft hover:bg-clay-2">
                  Open the demo shop <Icon name="arrowRight" size={18} />
                </Link>
                <Link to="/demo/nest" className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-card px-6 font-semibold text-ink hover:border-ink-2">
                  Second shop, same widget
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">Works in the phone's browser. No app to install.</p>
            </div>
            <HeroPlan />
          </div>
        </section>

        {/* problem */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="md:col-span-1">
              <Kicker>The problem</Kicker>
              <h2 className="mt-3 text-3xl text-ink">Furniture is bought from flat photos.</h2>
            </div>
            <div className="grid gap-5 text-ink-2 sm:grid-cols-3 md:col-span-2">
              <Problem title="Will it fit?" body="Shoppers can't tell from a photo whether a sofa fits their wall or leaves room to walk." />
              <Problem title="Can't visit" body="A buyer in Multan can't travel to a showroom in Lahore to see the piece in person." />
              <Problem title="Will it get in?" body="Narrow stairs, lifts and doors turn deliveries into returns. Nobody checks before." />
            </div>
          </div>
        </section>

        {/* features */}
        <section id="features" className="border-y border-line bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Kicker>All in one</Kicker>
            <h2 className="mt-3 max-w-2xl text-3xl text-ink sm:text-4xl">Nine tools that usually come from different vendors, in one widget.</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="bg-card p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-paper-2 text-ink">
                    <Icon name={f.icon} size={22} />
                  </span>
                  <h3 className="mt-4 font-sans text-base font-bold tracking-normal text-ink">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* engine */}
        <section id="engine" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Kicker>The spatial engine</Kicker>
          <h2 className="mt-3 max-w-3xl text-3xl text-ink sm:text-4xl">Not a viewer. A decision: does this piece belong in this room?</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              ['Measure', 'AR hit-testing on Android; planar homography from a reference sheet on iPhone; a depth model proposes corners.'],
              ['Place', 'Candidate poses along walls, greedy construction, then simulated annealing over clearance, walkways and relations.'],
              ['Validate', 'Walkway reachability by grid search from each door, clearances, proportion, ceiling height.'],
              ['Deliver', 'Box-through-door orientations, the corridor-corner turning formula, stairs, landings and lift diagonals.'],
            ].map(([t, b], i) => (
              <li key={t} className="rounded-2xl border border-line bg-card p-5 shadow-soft">
                <span className="font-display text-3xl text-clay">{i + 1}</span>
                <h3 className="mt-2 font-sans text-base font-bold tracking-normal">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{b}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* integration */}
        <section className="border-y border-line bg-ink text-paper">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#e9b38f]">For stores</p>
              <h2 className="mt-3 text-3xl sm:text-4xl">Two lines on your product page.</h2>
              <ol className="mt-8 space-y-5">
                {steps.map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span className="font-display text-xl text-[#e9b38f]">{s.n}</span>
                    <div>
                      <p className="font-semibold">{s.title}</p>
                      <p className="text-sm text-paper/70">{s.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="self-center overflow-x-auto rounded-2xl bg-black/30 p-5 font-mono text-[13px] leading-6 text-[#e8e2d6] ring-1 ring-white/10">
              <p className="text-paper/50">&lt;!-- once, in your theme --&gt;</p>
              <p>
                <span className="text-[#e9b38f]">&lt;script</span> src="https://roomsense.app/widget.js" defer<span className="text-[#e9b38f]">&gt;&lt;/script&gt;</span>
              </p>
              <p className="mt-3 text-paper/50">&lt;!-- on each product page --&gt;</p>
              <p>
                <span className="text-[#e9b38f]">&lt;div</span> data-roomsense data-store="your-store"
              </p>
              <p className="pl-6">
                data-product="shalimar-sofa"<span className="text-[#e9b38f]">&gt;&lt;/div&gt;</span>
              </p>
            </div>
          </div>
        </section>

        {/* demos */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <Kicker>Try it</Kicker>
          <h2 className="mt-3 text-3xl text-ink">Two different shops. The same two lines.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <DemoCard to="/demo/shahi" name="Shahi Furniture" tag="Classic, Lahore" tone="bg-[#5b2a1e] text-[#f3e3c7]" />
            <DemoCard to="/demo/nest" name="Nest Living" tag="Modern, Karachi" tone="bg-[#e9ecea] text-[#1f2b29]" />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <Logo />
          <p>
            University project. Demo shops and products are fictional. 3D models are credited in the repository.{' '}
            <Link to="/dashboard" className="font-semibold text-ink-2 underline underline-offset-2">Store dashboard</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="RoomSense home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? '#f6f3ee' : '#1d2a26'} />
        <path d="M8 22V12l8-5 8 5v10" fill="none" stroke={light ? '#1d2a26' : '#e9dcc6'} strokeWidth="2.2" strokeLinejoin="round" />
        <rect x="12" y="16" width="8" height="6" rx="1.5" fill="#d9774b" />
      </svg>
      <span className={`font-display text-xl ${light ? 'text-paper' : 'text-ink'}`}>RoomSense</span>
    </Link>
  )
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-clay pl-4">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[15px] leading-relaxed">{body}</p>
    </div>
  )
}

function DemoCard({ to, name, tag, tone }: { to: string; name: string; tag: string; tone: string }) {
  return (
    <Link to={to} className={`group flex items-end justify-between rounded-2xl p-7 shadow-soft transition-transform hover:-translate-y-0.5 ${tone}`}>
      <div>
        <p className="text-sm opacity-70">{tag}</p>
        <p className="mt-1 font-display text-3xl">{name}</p>
      </div>
      <Icon name="arrowRight" size={26} className="transition-transform group-hover:translate-x-1" />
    </Link>
  )
}

/** Hero illustration: a measured room with an auto-placed layout and a fit check. */
function HeroPlan() {
  return (
    <figure className="relative">
      <div className="rounded-[1.6rem] border border-line bg-card p-4 shadow-lift sm:p-6">
        <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
          <span>Example · Lounge 480 × 400 cm</span>
          <span className="rounded-full bg-sage-soft px-2.5 py-1 text-sage">Fits · 92/100</span>
        </div>
        <svg viewBox="0 0 480 400" className="mt-4 w-full" role="img" aria-label="Floor plan with a sofa, coffee table, armchair and TV unit placed automatically">
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="#c8653a" strokeOpacity="0.25" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="10" y="10" width="460" height="380" fill="#fbf8f3" stroke="#1d2a26" strokeWidth="6" />
          {/* door */}
          <rect x="340" y="384" width="90" height="12" fill="#fbf8f3" />
          <path d="M340 390 A90 90 0 0 1 430 300" fill="none" stroke="#7a837f" strokeDasharray="4 4" />
          <line x1="340" y1="390" x2="340" y2="300" stroke="#7a837f" strokeWidth="2" />
          {/* window */}
          <rect x="120" y="5" width="160" height="10" fill="#dfeae6" stroke="#1d2a26" strokeWidth="1.5" />
          {/* walkway */}
          <path d="M385 300 C 380 230, 300 220, 250 215" fill="none" stroke="#3f7d64" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
          {/* tv unit */}
          <rect x="150" y="26" width="160" height="40" rx="4" fill="#e8e1d6" stroke="#44514c" strokeWidth="1.5" />
          <text x="230" y="51" textAnchor="middle" fontSize="12" fill="#44514c" fontFamily="Manrope">TV unit</text>
          {/* coffee table */}
          <rect x="175" y="180" width="110" height="60" rx="8" fill="#efe6d8" stroke="#44514c" strokeWidth="1.5" />
          {/* sofa (new item) */}
          <rect x="120" y="270" width="220" height="95" rx="14" fill="url(#hatch)" stroke="#c8653a" strokeWidth="2.5" />
          <rect x="132" y="282" width="196" height="40" rx="8" fill="#fff" fillOpacity="0.6" stroke="#c8653a" strokeOpacity="0.5" />
          <text x="230" y="350" textAnchor="middle" fontSize="13" fontWeight="700" fill="#a94f28" fontFamily="Manrope">Shalimar 3-seater</text>
          {/* armchair */}
          <rect x="30" y="160" width="80" height="85" rx="12" fill="#e8e1d6" stroke="#44514c" strokeWidth="1.5" transform="rotate(12 70 200)" />
          {/* dimension */}
          <line x1="120" y1="378" x2="340" y2="378" stroke="#1d2a26" strokeWidth="1" />
          <line x1="120" y1="372" x2="120" y2="384" stroke="#1d2a26" />
          <line x1="340" y1="372" x2="340" y2="384" stroke="#1d2a26" />
          <text x="230" y="374" textAnchor="middle" fontSize="11" fill="#1d2a26" fontFamily="Manrope">220 cm</text>
        </svg>
        <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <HeroCheck ok label="Walkway from the door: 95 cm" />
          <HeroCheck ok label="Faces the TV at 2.4 m" />
          <HeroCheck ok label="Through the door stood on end" />
          <HeroCheck ok label="Delivery to Multan: Rs 9,800" />
        </ul>
      </div>
      <figcaption className="sr-only">Example of a RoomSense fit report</figcaption>
    </figure>
  )
}

function HeroCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-ink-2">
      <span className={`grid h-5 w-5 place-items-center rounded-full ${ok ? 'bg-sage-soft text-sage' : 'bg-danger-soft text-danger'}`}>
        <Icon name={ok ? 'check' : 'x'} size={13} />
      </span>
      {label}
    </li>
  )
}
