// @ts-check
// A small line diff so the user can see what "overwrite" would change before choosing.
// Browser-safe (the page imports it); plain LCS — files here are a few hundred lines at most.

/** @typedef {{ t: " " | "+" | "-", s: string }} DiffLine */

/**
 * @param {string} before
 * @param {string} after
 * @returns {DiffLine[]}
 */
export function lineDiff(before, after) {
  const a = before.split("\n"), b = after.split("\n");
  const n = a.length, m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  /** @type {DiffLine[]} */
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: " ", s: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ t: "-", s: a[i] }); i++; }
    else { out.push({ t: "+", s: b[j] }); j++; }
  }
  while (i < n) out.push({ t: "-", s: a[i++] });
  while (j < m) out.push({ t: "+", s: b[j++] });
  return out;
}
