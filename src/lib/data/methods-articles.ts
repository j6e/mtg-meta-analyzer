/**
 * Article data for the /methods section.
 * Each article explains a method used on the site — both the math and the
 * operative decisions behind it.
 */

export interface UsageTag {
	label: string;
	href: string;
}

export interface ArticleSection {
	heading: string;
	/** HTML string rendered via {@html}. Developer-authored, no XSS risk. */
	content: string;
}

export interface MethodArticle {
	slug: string;
	title: string;
	description: string;
	usedOn: UsageTag[];
	sections: ArticleSection[];
}

// ── Articles ──

const winRateCorrection: MethodArticle = {
	slug: "win-rate-correction",
	title: "Win Rate Correction",
	description:
		"How we correct for survivorship bias when only top-32 standings are available, using a three-step de-biasing and shrinkage approach.",
	usedOn: [
		{ label: "Metagame scatter", href: "/metagame" },
		{ label: "Archetypes table", href: "/archetypes" },
	],
	sections: [
		{
			heading: "The problem",
			content: `
<p>
	Some tournaments only publish <strong>top-32 standings</strong> — each player's win-loss-draw
	record without full round-by-round pairings. This creates <a href="https://en.wikipedia.org/wiki/Survivorship_bias" target="_blank" rel="noopener">survivorship bias</a>: the top-32 players
	beat opponents who didn't make the cut, but those opponents' losses are invisible to us.
	In a closed system total wins equal total losses, but in top-32 data the wins always outnumber
	the losses, inflating every archetype's observed win rate above 50%.
</p>
<p>
	Other tournaments — paper events from melee.gg and, since May 2026, MTGO events sourced
	from the <a href="https://github.com/videre-project" target="_blank" rel="noopener">Videre Project</a> —
	publish full round data with pairings, giving us
	unbiased match-level information. The correction needs to handle both data sources
	gracefully, using the unbiased round data as an anchor when available.
</p>`,
		},
		{
			heading: "Step 1 — Remove systemic bias",
			content: `
<p>
	Compute the global average win rate using <strong>match-count weighting</strong>:
</p>
<div class="formula-block">
	raw<sub>avg</sub> = <span class="frac"><span class="num">&Sigma; wins<sub>i</sub></span><span class="den">&Sigma; total<sub>i</sub></span></span>
</div>
<p>
	In a closed system (paper tournaments with full rounds), this equals exactly 50%.
	For standings-only data, the surplus shows up as bias:
</p>
<div class="formula-block">
	bias = raw<sub>avg</sub> &minus; 0.5
</div>
<p>
	We use match-count weighting rather than archetype-share weighting because only actual
	match counts reflect the true surplus. Share-weighted averaging can create phantom bias
	in paper data where the true average is 50% by construction.
</p>`,
		},
		{
			heading: "Step 2 — Per-archetype prior from round data",
			content: `
<p>
	When paper (round-level) data is available, it provides an unbiased baseline for each
	archetype. We use it as a per-archetype <strong>prior</strong>, shrunk toward 50%
	based on how much round data we have.
</p>
<p>
	The shrinkage function uses a squared form for aggressive suppression of small samples:
</p>
<div class="formula-block">
	f(N<sub>round</sub>) = <span class="frac"><span class="num">N<sub>round</sub><sup>2</sup></span><span class="den">N<sub>round</sub><sup>2</sup> + K<sub>p</sub><sup>2</sup></span></span>
</div>
<p>
	where K<sub>p</sub> = 167 (calibrated so that f(500) &asymp; 0.9). The per-archetype prior is:
</p>
<div class="formula-block">
	prior<sub>i</sub> = 0.5 &times; (1 &minus; f) + round_wr<sub>i</sub> &times; f
</div>
<table class="method-table">
	<thead><tr><th>Round N</th><th>f(N)</th><th>Effect</th></tr></thead>
	<tbody>
		<tr><td>20</td><td>0.01</td><td>Prior &asymp; 50% (too few matches to trust)</td></tr>
		<tr><td>100</td><td>0.26</td><td>Modest paper influence</td></tr>
		<tr><td>500</td><td>0.90</td><td>Prior &asymp; paper win rate</td></tr>
	</tbody>
</table>
<p>
	Archetypes with no round data default to a flat 50% prior.
</p>`,
		},
		{
			heading: "Step 3 — Confidence shrinkage",
			content: `
<p>
	Each archetype's de-biased deviation from its prior is shrunk proportionally to our
	confidence in the combined sample:
</p>
<div class="formula-block">
	adjusted<sub>i</sub> = prior<sub>i</sub> + (raw_wr<sub>i</sub> &minus; raw<sub>avg</sub>) &times; <span class="frac"><span class="num">N<sub>i</sub></span><span class="den">N<sub>i</sub> + K</span></span>
</div>
<p>
	where K = <strong>median</strong> of total matches across all archetypes with data.
	The median is data-derived — no manual tuning required. It means an archetype with
	typical representation keeps about half its signal, larger archetypes keep more,
	and fringe archetypes with a handful of matches are appropriately regressed toward
	the prior.
</p>`,
		},
		{
			heading: "Properties",
			content: `
<ul>
	<li><strong>Relative ordering preserved</strong> — if deck A had a higher raw win rate than deck B, A stays higher after correction.</li>
	<li><strong>Large samples barely change</strong> — high-N archetypes keep their signal.</li>
	<li><strong>Two parameters</strong> — K (derived from data) and K<sub>p</sub> = 167 (calibrated once).</li>
	<li><strong>Graceful mixed data</strong> — paper tournaments contribute unbiased priors; standings-only tournaments still contribute useful relative signal.</li>
</ul>`,
		},
	],
};

const archetypeClassification: MethodArticle = {
	slug: "archetype-classification",
	title: "Archetype Classification",
	description:
		"A three-pass system that labels every decklist: rule-based signature cards, commander name fallback, then TF-IDF centroid classification for the rest.",
	usedOn: [
		{ label: "Every page", href: "/metagame" },
	],
	sections: [
		{
			heading: "Overview",
			content: `
<p>
	Every decklist submitted to a tournament needs to be classified into an archetype
	(e.g. "Boros Energy", "Azorius Control"). We use a <strong>three-pass cascade</strong>:
	deterministic rules first, statistical fallback last.
</p>
<ol>
	<li><strong>Pass 1 — Signature cards</strong> (rule-based, 100% confidence)</li>
	<li><strong>Pass 2 — Commander name</strong> (deterministic, Commander formats only)</li>
	<li><strong>Pass 3 — Centroid classification</strong> (TF-IDF + cosine similarity)</li>
</ol>
<p>
	If all three passes fail, the decklist is labeled "Unknown".
</p>`,
		},
		{
			heading: "Pass 1 — Signature card matching",
			content: `
<p>
	Each archetype is defined by a set of <strong>signature cards</strong> with constraints,
	configured in YAML files per format. A decklist matches an archetype if <em>all</em>
	its signature cards satisfy their constraints:
</p>
<ul>
	<li><code>minCopies: N</code> — the deck must contain &ge; N copies</li>
	<li><code>exactCopies: N</code> — the deck must contain exactly N copies</li>
	<li><code>usedAsCommander: true</code> — the card must be in the commander zone</li>
</ul>
<p>
	If multiple archetypes match (e.g. a deck matches both "Energy" and "Boros Energy"),
	the archetype with the <strong>most signature cards</strong> wins. This is a
	best-match heuristic — more specific definitions take priority.
</p>
<p>
	Signature card definitions are community-maintained. The
	<a href="/archetype-cleaner">Archetype Cleaner</a> page lets you review and edit
	these definitions and see how they map to player-reported archetype names.
</p>`,
		},
		{
			heading: "Pass 2 — Commander name fallback",
			content: `
<p>
	For Commander/EDH formats, if a decklist wasn't classified by signature cards,
	the archetype name is derived directly from the commander(s):
</p>
<ul>
	<li>Single commander &rarr; archetype = commander's name</li>
	<li>Partner commanders &rarr; names sorted alphabetically, joined with " & "</li>
</ul>
<p>
	This pass is only active when the format's configuration has
	<code>nameEqualsCommander: true</code>.
</p>`,
		},
		{
			heading: "Pass 3 — Centroid classification (TF-IDF)",
			content: `
<p>
	Decklists that remain unclassified after the deterministic passes are classified
	by <strong>nearest centroid</strong> using <a href="https://en.wikipedia.org/wiki/Tf%E2%80%93idf" target="_blank" rel="noopener">TF-IDF</a> vectors and <a href="https://en.wikipedia.org/wiki/Cosine_similarity" target="_blank" rel="noopener">cosine similarity</a>.
</p>
<p><strong>Vectorization:</strong></p>
<div class="formula-block">
	TF(card, deck) = <span class="frac"><span class="num">quantity</span><span class="den">total cards</span></span>
</div>
<div class="formula-block">
	IDF(card) = ln <span class="frac"><span class="num">N</span><span class="den">df(card)</span></span>
</div>
<div class="formula-block">
	TF-IDF = TF &times; IDF
</div>
<p>
	Each decklist becomes a sparse vector in card-space, normalized to unit length
	(L2 norm). This means cosine similarity reduces to a simple dot product.
</p>
<p><strong>Centroid building:</strong> For each already-classified archetype, we
	average the TF-IDF vectors of all its labeled decklists and re-normalize to
	unit length. This gives one representative vector per archetype.
</p>
<p><strong>Classification:</strong> The unclassified decklist's vector is compared
	against all centroids by dot product (= cosine similarity, since both are
	unit-length). The highest-similarity centroid wins, provided its similarity
	exceeds the <strong>minimum confidence threshold</strong> (default 0.4).
	Below that threshold, the decklist is marked "Unknown".
</p>`,
		},
		{
			heading: "Operative decisions",
			content: `
<ul>
	<li><strong>Pooled corpus</strong> — when analyzing multiple tournaments, the TF-IDF
	corpus and training set are built from all tournaments combined. This lets small
	tournaments benefit from labeled data in larger ones.</li>
	<li><strong>Strict mode</strong> — some archetypes are marked <code>strictMode: true</code>,
	meaning they can only be assigned by signature card match, never by the centroid
	classifier. This prevents the statistical pass from creating false positives for
	archetypes with very specific card requirements.</li>
	<li><strong>Front-face normalization</strong> — double-faced cards (e.g. "Fable of the
	Mirror-Breaker // Reflection of Kiki-Jiki") are normalized to their front face
	name to avoid duplicate entries.</li>
</ul>`,
		},
	],
};

const intentionalDraws: MethodArticle = {
	slug: "intentional-draws",
	title: "Intentional Draws",
	description:
		"How we detect intentional draws (IDs) in tournament data and why they are excluded from win rate calculations.",
	usedOn: [
		{ label: "Matchup matrix", href: "/metagame" },
		{ label: "All win rate stats", href: "/archetypes" },
	],
	sections: [
		{
			heading: "What is an intentional draw?",
			content: `
<p>
	In Magic: The Gathering tournaments, players in the final Swiss rounds who are
	both already qualified for the top cut can agree to <strong>intentionally draw</strong>
	(ID) their match rather than play it out. This secures their position without
	risking a loss.
</p>
<p>
	Intentional draws are a legitimate part of competitive Magic, but they carry no
	information about deck performance — they reflect tournament standings, not
	matchup quality.
</p>`,
		},
		{
			heading: "How we detect them",
			content: `
<p>
	In match data, an intentional draw is recorded as a <strong>0-0-3 result</strong>:
	zero game wins for each player, three game draws. This is distinct from a naturally
	drawn match (which would show actual game results like 1-1-1).
</p>
<p>
	The detection is a simple string check on the match result field:
</p>
<div class="formula-block">
	isIntentionalDraw = (result === "0-0-3")
</div>
<p>
	A three-draw match is essentially impossible in normal play — it requires all three
	games to end in a draw. In practice, this pattern exclusively represents intentional
	draws.
</p>`,
		},
		{
			heading: "How we handle them",
			content: `
<ul>
	<li><strong>Excluded from win rate calculations</strong> — IDs are not counted as
	wins, losses, or draws. They do not contribute to a matchup cell's W-L-D record
	or to the overall archetype win rate.</li>
	<li><strong>Tracked separately</strong> — each matchup cell and archetype stat
	records the number of IDs. This lets us display the ID count for transparency
	without letting it pollute the win rate signal.</li>
	<li><strong>Both players credited</strong> — when an ID is detected, both players'
	archetypes get an ID counted in the relevant matchup cell.</li>
</ul>
<p>
	This approach treats IDs as "no information" events: they tell us these players
	met in a round, but nothing about how the matchup would have played out.
</p>`,
		},
	],
};

const matchupMatrix: MethodArticle = {
	slug: "matchup-matrix",
	title: "Matchup Matrix",
	description:
		"How matchup win rates are computed from round data and standings, including how draws, mirrors, and small archetypes are handled.",
	usedOn: [
		{ label: "Metagame page", href: "/metagame" },
		{ label: "Archetype matchups tab", href: "/archetypes" },
	],
	sections: [
		{
			heading: "Data sources",
			content: `
<p>
	The matchup matrix draws from two data sources:
</p>
<ul>
	<li><strong>Round data</strong> — full pairings with match results. Each match maps
	directly to a cell in the matrix (archetype A vs archetype B).</li>
	<li><strong>Standings remainder</strong> — for tournaments with incomplete round data,
	we know each player's final W-L-D record from the standings. By subtracting the
	matches we already have from recorded rounds, we get the "remainder" — matches we
	know the outcome of but don't have pairing information for. These contribute to
	<em>overall</em> archetype stats (total W/L/D) but <strong>not</strong> to specific
	matchup cells, since we don't know who played whom.</li>
</ul>`,
		},
		{
			heading: "Win rate formula",
			content: `
<p>
	For each cell in the matrix (archetype A vs archetype B):
</p>
<div class="formula-block">
	win rate = <span class="frac"><span class="num">wins</span><span class="den">wins + losses + draws</span></span>
</div>
<p>
	Draws count against <strong>both</strong> sides, so opposing cells may not sum to 100%.
	For example, if A vs B is 60% and B vs A is 35%, the remaining 5% represents draws
	that penalize both.
</p>
<p>
	Byes (rounds where a player has no opponent) are excluded from the matrix entirely.
	Intentional draws (0-0-3) are also excluded (see the
	<a href="/methods/intentional-draws">Intentional Draws</a> article).
</p>`,
		},
		{
			heading: "Mirror matches",
			content: `
<p>
	By default, mirror matches (same archetype vs itself) are <strong>excluded</strong>
	from the matrix. In a mirror match, one player's win is the other's loss within
	the same archetype, which adds noise to that archetype's overall statistics without
	providing useful matchup information.
</p>
<p>
	This is a configurable option — the sidebar filter allows including mirrors if desired.
</p>`,
		},
		{
			heading: "Archetype collapsing",
			content: `
<p>
	Small archetypes with very few players produce unreliable matchup data. Two
	mechanisms handle this:
</p>
<ul>
	<li><strong>Top N</strong> — keep only the N most-played archetypes. Everything else
	is merged into an "Other" bucket.</li>
	<li><strong>Minimum metagame share</strong> — archetypes below a share threshold
	are merged into "Other".</li>
</ul>
<p>
	The "Unknown" category (decklists that couldn't be classified) is merged into
	"Other" when "Other" exists, and shown separately otherwise. This prevents
	Unknown from cluttering the matrix while keeping it visible when there's no
	Other bucket.
</p>`,
		},
	],
};

const deckAggregation: MethodArticle = {
	slug: "deck-aggregation",
	title: "Deck Aggregation (NOKA)",
	description:
		"Nth Order Karsten Aggregation: how we build a consensus decklist from multiple decklists of the same archetype.",
	usedOn: [
		{ label: "Archetype aggregate tab", href: "/archetypes" },
	],
	sections: [
		{
			heading: "The idea",
			content: `
<p>
	Given 50+ decklists of the same archetype, what does the "consensus" list look like?
	Rather than averaging card counts (which produces fractional, unplayable numbers),
	we treat each <em>nth copy</em> of a card as an independent candidate. The 1st copy
	of a staple ranks higher than the 4th copy of a flex slot.
</p>
<p>
	This approach is based on
	<a href="https://strategy.channelfireball.com/all-strategy/tag/frank-karstens-magic-math/" target="_blank" rel="noopener">Frank Karsten's original method</a>,
	extended by
	<a href="https://elvishjerricco.github.io/2015/09/24/automatically-generating-magic-decks.html" target="_blank" rel="noopener">Will Fancher</a>
	to higher orders.
</p>`,
		},
		{
			heading: "Order 1 — Pure popularity",
			content: `
<p>
	For each card, count how many of the input decklists include at least 1 copy,
	at least 2 copies, etc. Each (card, instance) pair gets scored by its frequency
	across decklists. The top 60 card-copies become the mainboard; top 15 become
	the sideboard.
</p>
<div class="formula-block">
	score = freq &times; &frac12;
</div>
<p>
	Ties are broken by total copies across all decklists, then alphabetically.
</p>`,
		},
		{
			heading: "Order 2 — Pair synergy",
			content: `
<p>
	In addition to individual card frequency, order 2 considers how often cards
	appear <em>together</em>. Cards that are frequently paired in the same decklist
	get a synergy boost.
</p>
<div class="formula-block">
	score = freq &times; &frac12; + avg pair freq &times; &frac14;
</div>
<p>
	The pair frequency for a card is the average frequency of all pairs that
	include that card among the other cards still in the pool.
</p>`,
		},
		{
			heading: "Order 3 — Triple synergy",
			content: `
<p>
	Order 3 adds triple-card co-occurrence on top of pairs:
</p>
<div class="formula-block">
	score = freq &times; &frac12; + avg pair freq &times; &frac14; + avg triple freq &times; &frac18;
</div>
<p>
	The weighting pattern 1/2, 1/4, 1/8 (= 1/2<sup>size</sup>) ensures that
	individual card popularity dominates, with pair and triple synergy as
	secondary signals.
</p>`,
		},
		{
			heading: "Iterative removal",
			content: `
<p>
	For orders 2 and 3, we start with the maximum pool (every card-copy that
	appears in any input decklist) and <strong>iteratively remove</strong> the
	lowest-scored card-copy until the target size (60 mainboard / 15 sideboard)
	is reached.
</p>
<p>
	After each removal, pair and triple scores are recalculated against the
	current pool, so removing one card can change the score of others. This
	is more expensive than order 1's simple sort-and-cut, but it produces
	more internally consistent lists.
</p>`,
		},
	],
};

const cardImpact: MethodArticle = {
	slug: "card-impact",
	title: "Card Impact Analysis",
	description:
		"Bayesian logistic regression that quantifies how flex card choices jointly predict wins, controlling for correlated card selections.",
	usedOn: [
		{ label: "Archetype card impact tab", href: "/archetypes" },
	],
	sections: [
		{
			heading: "Goal",
			content: `
<p>
	Given an archetype's decklists and match results, which <strong>flex card choices</strong>
	predict winning? The Card Impact tab answers this with a multivariate model: each card's
	coefficient reflects its effect <em>after controlling for the other cards</em>.
	This is important because card choices are correlated — players who include Card A
	often also include Card B. A univariate analysis (like the Winrate Splitter) can
	mistake proxies for causes.
</p>`,
		},
		{
			heading: "Feature selection",
			content: `
<p>
	Not all cards in a decklist are informative. We filter to <strong>flex features</strong>:
</p>
<ul>
	<li>Basic lands are excluded (their count is a consequence of other choices).</li>
	<li>Auto-includes (cards where &gt; 90% of decklists run the same number of copies)
	are excluded — there's no variance to analyze.</li>
	<li>The remaining cards are ranked by <strong>variance</strong> in copy count across
	decklists. The top 12 by variance become the model's features.</li>
</ul>
<p>
	Each feature is <strong>standardized</strong> (zero mean, unit variance) before
	entering the model.
</p>`,
		},
		{
			heading: "The model",
			content: `
<p>
	We fit a <a href="https://en.wikipedia.org/wiki/Logistic_regression#Bayesian" target="_blank" rel="noopener"><strong>Bayesian logistic regression</strong></a>:
</p>
<div class="formula-block">
	P(win) = sigmoid(X&beta;) = <span class="frac"><span class="num">1</span><span class="den">1 + e<sup>&minus;X&beta;</sup></span></span>
</div>
<p>
	where X is the design matrix (one row per match, one column per card feature plus intercept)
	and &beta; is the coefficient vector.
</p>
<p><strong>Priors:</strong></p>
<ul>
	<li>Card coefficients: Normal(0, 1) — mild regularization that pulls coefficients
	toward zero, preventing overfitting on small samples.</li>
	<li>Intercept: Normal(0, 100) — weak prior that lets the baseline win probability
	be determined by the data.</li>
</ul>`,
		},
		{
			heading: "Solver",
			content: `
<p>
	The model is fit using
	<a href="https://en.wikipedia.org/wiki/Iteratively_reweighted_least_squares" target="_blank" rel="noopener">Iteratively Reweighted Least Squares</a>
	(IRLS). Convergence is reached when the maximum coefficient change falls below
	10<sup>&minus;6</sup>, or after 25 iterations.
</p>`,
		},
		{
			heading: "Posterior and credible intervals",
			content: `
<p>
	After convergence, the <a href="https://en.wikipedia.org/wiki/Laplace%27s_approximation" target="_blank" rel="noopener"><strong>Laplace approximation</strong></a> gives us a posterior
	covariance matrix: Cov(&beta;) = H<sup>&minus;1</sup> at the final &beta;. Each
	card's 95% credible interval is:
</p>
<div class="formula-block">
	&beta;<sub>j</sub> &plusmn; 1.96 &times; SE<sub>j</sub>
</div>
<p>
	where SE<sub>j</sub> = &radic;Cov(&beta;)<sub>jj</sub>.
</p>
<p>
	The <strong>impact score</strong> transforms the raw coefficient into a bounded [-100, +100] scale:
</p>
<div class="formula-block">
	impact = tanh(&beta; / 2) &times; 100
</div>
<p>
	Positive values mean the card increases win probability; negative values decrease it.
</p>`,
		},
		{
			heading: "Interpreting results",
			content: `
<p>
	Because this is a multivariate model, a card that looks significant in the
	univariate <a href="/methods/statistical-testing">Winrate Splitter</a> but not here
	likely has its effect explained by another correlated card. Conversely, a card
	significant here but not in the Splitter has a genuine independent effect that was
	previously masked.
</p>
<p>
	The <strong>baseline win probability</strong> (sigmoid of the intercept) represents
	the expected win rate when all flex features are at their mean values.
</p>`,
		},
	],
};

const statisticalTesting: MethodArticle = {
	slug: "statistical-testing",
	title: "Statistical Testing",
	description:
		"Fisher's exact test, Benjamini-Hochberg correction for multiple testing, Bayesian credible intervals, and how we assess matchup uncertainty.",
	usedOn: [
		{ label: "Archetype splitter tab", href: "/archetypes" },
		{ label: "Matchup tooltips", href: "/metagame" },
	],
	sections: [
		{
			heading: "Bayesian credible intervals",
			content: `
<p>
	For matchup win rates, we compute <strong>95% Bayesian credible intervals</strong>
	using a <a href="https://en.wikipedia.org/wiki/Beta-binomial_distribution" target="_blank" rel="noopener">Beta-Binomial model</a>:
</p>
<ul>
	<li><strong>Prior:</strong> Beta(1, 1) — uniform, assumes no prior knowledge</li>
	<li><strong>Posterior:</strong> Beta(1 + wins, 1 + losses)</li>
	<li><strong>95% CI:</strong> the 2.5th and 97.5th quantiles of the posterior</li>
</ul>
<p>
	The mean estimate is:
</p>
<div class="formula-block">
	mean = <span class="frac"><span class="num">1 + wins</span><span class="den">2 + wins + losses</span></span>
</div>
<p>
	With few observations, the interval is wide (high uncertainty). As matches accumulate,
	it narrows around the true rate. The Beta quantile is computed via bisection on the
	regularized incomplete beta function (continued fraction method from Numerical Recipes).
</p>`,
		},
		{
			heading: "P(A beats B)",
			content: `
<p>
	We also compute the probability that one archetype's true win rate exceeds another's:
</p>
<div class="formula-block">
	P(A &gt; B) = &int;<sub>0</sub><sup>1</sup> CDF<sub>B</sub>(x) &times; PDF<sub>A</sub>(x) dx
</div>
<p>
	where CDF<sub>B</sub> and PDF<sub>A</sub> are the Beta CDF and PDF of each archetype's
	posterior. This integral is evaluated numerically using <a href="https://en.wikipedia.org/wiki/Simpson%27s_rule" target="_blank" rel="noopener">Simpson's rule</a> with
	1000 points. A value near 1.0 means A is almost certainly better;
	near 0.5 means we can't tell them apart.
</p>`,
		},
		{
			heading: "Fisher's exact test",
			content: `
<p>
	The <strong>Winrate Splitter</strong> tab tests whether a specific card copy count
	affects win rate. For each split (e.g. "&ge; 3 copies vs. &lt; 3 copies"), we build a
	2&times;2 contingency table:
</p>
<table class="method-table">
	<thead><tr><th></th><th>Wins</th><th>Losses</th></tr></thead>
	<tbody>
		<tr><td>Group (&ge; N copies)</td><td>gW</td><td>gL</td></tr>
		<tr><td>Baseline (&lt; N copies)</td><td>bW</td><td>bL</td></tr>
	</tbody>
</table>
<p>
	<a href="https://en.wikipedia.org/wiki/Fisher%27s_exact_test" target="_blank" rel="noopener">Fisher's exact test</a>
	computes the <strong>two-sided p-value</strong> by summing
	the probabilities of all tables as extreme as or more extreme than the observed one,
	using the <a href="https://en.wikipedia.org/wiki/Hypergeometric_distribution" target="_blank" rel="noopener">hypergeometric distribution</a>. All computations use log-space arithmetic
	to avoid numerical overflow.
</p>`,
		},
		{
			heading: "Multiple testing correction",
			content: `
<p>
	The Auto-Scan mode tests every card at once. Testing dozens of cards inflates the
	chance of false positives — if you test 50 cards at &alpha; = 0.05, you'd expect
	~2.5 false positives by chance.
</p>
<p>
	We apply the <a href="https://en.wikipedia.org/wiki/False_discovery_rate#Benjamini%E2%80%93Hochberg_procedure" target="_blank" rel="noopener"><strong>Benjamini-Hochberg procedure</strong></a> to control the
	<a href="https://en.wikipedia.org/wiki/False_discovery_rate" target="_blank" rel="noopener"><strong>false discovery rate</strong></a> (FDR):
</p>
<ol>
	<li>Sort all p-values from smallest to largest.</li>
	<li>For each rank <em>k</em>, compute: p<sub>adj</sub> = p<sub>raw</sub> &times; n / k</li>
	<li>Enforce monotonicity by taking the cumulative minimum from the bottom up.</li>
</ol>
<p>
	The adjusted p-values control the expected proportion of false discoveries among
	all rejected hypotheses, rather than the probability of any single false positive.
</p>`,
		},
		{
			heading: "Significance levels",
			content: `
<table class="method-table">
	<thead><tr><th>Symbol</th><th>p-value</th><th>Meaning</th></tr></thead>
	<tbody>
		<tr><td>***</td><td>&lt; 0.001</td><td>Very strong evidence</td></tr>
		<tr><td>**</td><td>&lt; 0.01</td><td>Strong evidence</td></tr>
		<tr><td>*</td><td>&lt; 0.05</td><td>Moderate evidence</td></tr>
		<tr><td>(none)</td><td>&ge; 0.05</td><td>Not significant</td></tr>
	</tbody>
</table>
<p>
	These thresholds are conventional. After BH correction, the stars reflect
	adjusted p-values, making them more conservative than their raw counterparts.
</p>`,
		},
	],
};

const metagameEvolution: MethodArticle = {
	slug: "metagame-evolution",
	title: "Metagame Evolution",
	description:
		"How metagame share trends are computed over time, including period bucketing and the winners-mode filter.",
	usedOn: [
		{ label: "Metagame evolution chart", href: "/metagame" },
	],
	sections: [
		{
			heading: "Period aggregation",
			content: `
<p>
	The evolution chart groups tournaments into <strong>calendar periods</strong> and
	computes per-archetype metagame share within each period. Three period sizes are
	available:
</p>
<table class="method-table">
	<thead><tr><th>Period</th><th>Definition</th></tr></thead>
	<tbody>
		<tr><td>1 week</td><td>ISO 8601 weeks (Monday through Sunday)</td></tr>
		<tr><td>2 weeks</td><td>14-day periods, anchored to the most recent week's Sunday and counting backwards</td></tr>
		<tr><td>1 month</td><td>Full calendar months</td></tr>
	</tbody>
</table>
<p>
	Periods are generated backwards from the latest tournament date, so the most recent
	period always aligns with the latest data. The first period is clipped to the
	earliest tournament date.
</p>`,
		},
		{
			heading: "Share computation",
			content: `
<p>
	Within each period, metagame share for an archetype is simply:
</p>
<div class="formula-block">
	share = <span class="frac"><span class="num">players in archetype</span><span class="den">total players in period</span></span>
</div>
<p>
	"Unknown" decklists are excluded from both numerator and denominator.
	Small archetypes below the collapse threshold are merged into "Other",
	using the same rules as the matchup matrix.
</p>
<p>
	Periods with no tournaments produce <code>null</code> values (shown as gaps
	in the chart), distinguishing them from periods where the archetype was present
	but had 0% share.
</p>`,
		},
		{
			heading: "Winners mode",
			content: `
<p>
	Winners mode filters players to the <strong>top percentile</strong> of each tournament's
	standings. By default, the cutoff is the top 25% (configurable from 10% to 50%).
</p>
<p>
	A player qualifies if their rank &le; ceil(playerCount &times; cutoff). When the cutoff
	rank exceeds the available player data (some tournaments only publish top-32), the
	chart shows a warning that the data is incomplete.
</p>
<p>
	This mode answers a different question than the standard chart: not "what are people
	playing?" but "what are the <em>winners</em> playing?" A shift in the winners chart
	can signal a metagame trend before it shows up in overall share.
</p>`,
		},
	],
};

// ── Exports ──

export const methodArticles: MethodArticle[] = [
	winRateCorrection,
	archetypeClassification,
	intentionalDraws,
	matchupMatrix,
	deckAggregation,
	cardImpact,
	statisticalTesting,
	metagameEvolution,
];

export function getArticleBySlug(slug: string): MethodArticle | undefined {
	return methodArticles.find((a) => a.slug === slug);
}
