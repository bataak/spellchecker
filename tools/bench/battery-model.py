import math
import random
import statistics

DRAWS = 200_000
SEED = 20261101
IDLE_W = (6.75, 7.17)
CHROMIUM_RUNS = [0.026, 0.063, 0.071]
SINGLE_RUNS = {"firefox": 0.015, "writer": 0.041, "word": 0.040}
RUN_SCATTER = statistics.stdev(math.log(x) for x in CHROMIUM_RUNS)
BASE_K = (1.0, 3.0)
FIREFOX_RENDER_K = (1.0, 5.8)
MACOS_APP_SHARE = {
    "chromium": (0.014, 0.010, 0.016),
    "firefox": (0.005, 0.004, 0.003),
}


def draw_share(rng, runs):
    centre = statistics.mean(math.log(x) for x in runs)
    return math.exp(rng.gauss(centre, RUN_SCATTER / math.sqrt(len(runs))))


def simulate(firefox_k):
    rng = random.Random(SEED)
    samples = {name: [] for name in ("chromium", "firefox", "writer", "word")}
    loss = {name: [] for name in samples}
    for _ in range(DRAWS):
        idle = rng.uniform(*IDLE_W)
        k = rng.uniform(*BASE_K)
        extra = {
            "chromium": k * draw_share(rng, CHROMIUM_RUNS),
            "firefox": rng.uniform(*firefox_k) * draw_share(rng, [SINGLE_RUNS["firefox"]]),
            "writer": k * draw_share(rng, [SINGLE_RUNS["writer"]]),
            "word": k * draw_share(rng, [SINGLE_RUNS["word"]]),
        }
        for name, watts in extra.items():
            samples[name].append(watts)
            loss[name].append(watts / (idle + watts))
    return samples, loss


def interval(values):
    ordered = sorted(values)
    return tuple(ordered[int(len(ordered) * q)] for q in (0.05, 0.5, 0.95))


def report(title, firefox_k):
    samples, loss = simulate(firefox_k)
    print(title)
    for name in samples:
        low, mid, high = interval(samples[name])
        share = interval(loss[name])
        print(
            f"  {name:9} +{mid:.3f} W [{low:.3f}-{high:.3f}]"
            f"  runtime -{share[1] * 100:.1f}% [{share[0] * 100:.1f}-{share[2] * 100:.1f}]"
        )
    for app in ("chromium", "firefox"):
        for other in ("word", "writer"):
            pairs = list(zip(loss[app], loss[other]))
            more = sum(a > b for a, b in pairs) / DRAWS
            within2 = sum(abs(a - b) < 0.02 for a, b in pairs) / DRAWS
            within5 = sum(abs(a - b) < 0.05 for a, b in pairs) / DRAWS
            print(
                f"  {app} vs {other}: P(more)={more:.2f}"
                f" P(|diff|<2%)={within2:.2f} P(|diff|<5%)={within5:.2f}"
            )


def runtime_loss_bounds(shares):
    low = min(shares) * BASE_K[0]
    high = max(shares) * BASE_K[1]
    return low / (IDLE_W[1] + low), high / (IDLE_W[0] + high)


def report_macos():
    print("macos: Windows laptop power values, min-max, not measured")
    for name, shares in MACOS_APP_SHARE.items():
        low, high = runtime_loss_bounds(shares)
        print(f"  {name:9} runtime -{low * 100:.2f}% to -{high * 100:.2f}%")


print(f"run scatter (log sd): {RUN_SCATTER:.2f}")
report("base: k 1-3 W per core, shared", BASE_K)
report("firefox rendering: firefox k 1-5.8", FIREFOX_RENDER_K)
report_macos()
