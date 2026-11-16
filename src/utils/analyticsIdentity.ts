type Stop = () => void;
type Account = Record<string, unknown> | null;

// Keep async Firebase callbacks from reassigning a previous account after sign-out.
export function bindAnalyticsIdentity(
  watchAuth: (next: (uid: string | null) => void) => Stop,
  watchAccount: (uid: string, next: (account: Account) => void, error: () => void) => Stop,
  assign: (id: unknown) => void,
) {
  let active = true;
  let generation = 0;
  let stopAccount: Stop | undefined;
  const stopAuth = watchAuth((uid) => {
    if (!active) return;
    const current = ++generation;
    stopAccount?.();
    stopAccount = undefined;
    assign(null);
    if (!uid) return;
    const update = (account: Account) => {
      if (active && current === generation)
        assign(
          account?.deleted === true || account?.linking === true ? null : account?.analyticsId,
        );
    };
    stopAccount = watchAccount(uid, update, () => update(null));
  });
  return () => {
    active = false;
    generation++;
    stopAuth();
    stopAccount?.();
    assign(null);
  };
}
