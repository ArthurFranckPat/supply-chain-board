var N = {
  context: void 0,
  registry: void 0,
  effects: void 0,
  done: !1,
  getContextId() {
    return ze(this.context.count)
  },
  getNextContextId() {
    return ze(this.context.count++)
  },
}
function ze(e) {
  let t = String(e),
    n = t.length - 1
  return N.context.id + (n ? String.fromCharCode(96 + n) : '') + t
}
function Fe(e) {
  N.context = e
}
function $t() {
  return { ...N.context, id: N.getNextContextId(), count: 0 }
}
var kt = !1,
  Ot = (e, t) => e === t,
  oe = Symbol('solid-proxy')
var $e = Symbol('solid-track')
var Ae = { equals: Ot },
  Qe = null,
  tt = ot,
  Q = 1,
  Ce = 2,
  nt = { owned: null, cleanups: null, context: null, owner: null }
var k = null,
  g = null,
  ke = null,
  ge = null,
  T = null,
  U = null,
  W = null,
  Te = 0
function ve(e, t) {
  let n = T,
    r = k,
    i = e.length === 0,
    s = t === void 0 ? r : t,
    l = i ? nt : { owned: null, cleanups: null, context: s ? s.context : null, owner: s },
    o = i ? e : () => e(() => Z(() => ae(l)))
  ;((k = l), (T = null))
  try {
    return te(o, !0)
  } finally {
    ;((T = n), (k = r))
  }
}
function V(e, t) {
  t = t ? Object.assign({}, Ae, t) : Ae
  let n = { value: e, observers: null, observerSlots: null, comparator: t.equals || void 0 },
    r = (i) => (
      typeof i == 'function' &&
        (g && g.running && g.sources.has(n) ? (i = i(n.tValue)) : (i = i(n.value))),
      it(n, i)
    )
  return [st.bind(n), r]
}
function L(e, t, n) {
  let r = Be(e, t, !1, Q)
  ke && g && g.running ? U.push(r) : Oe(r)
}
function ue(e, t, n) {
  tt = Tt
  let r = Be(e, t, !1, Q),
    i = Ve && _t(Ve)
  ;(i && (r.suspense = i), (!n || !n.render) && (r.user = !0), W ? W.push(r) : Oe(r))
}
function ie(e, t, n) {
  n = n ? Object.assign({}, Ae, n) : Ae
  let r = Be(e, t, !0, 0)
  return (
    (r.observers = null),
    (r.observerSlots = null),
    (r.comparator = n.equals || void 0),
    ke && g && g.running ? ((r.tState = Q), U.push(r)) : Oe(r),
    st.bind(r)
  )
}
function rt(e) {
  return te(e, !1)
}
function Z(e) {
  if (!ge && T === null) return e()
  let t = T
  T = null
  try {
    return ge ? ge.untrack(e) : e()
  } finally {
    T = t
  }
}
function Le(e) {
  ue(() => Z(e))
}
function de(e) {
  return (k === null || (k.cleanups === null ? (k.cleanups = [e]) : k.cleanups.push(e)), e)
}
function De() {
  return T
}
function Et(e) {
  if (g && g.running) return (e(), g.done)
  let t = T,
    n = k
  return Promise.resolve().then(() => {
    ;((T = t), (k = n))
    let r
    return (
      (ke || Ve) &&
        ((r =
          g ||
          (g = {
            sources: new Set(),
            effects: [],
            promises: new Set(),
            disposed: new Set(),
            queue: new Set(),
            running: !0,
          })),
        r.done || (r.done = new Promise((i) => (r.resolve = i))),
        (r.running = !0)),
      te(e, !1),
      (T = k = null),
      r ? r.done : void 0
    )
  })
}
var [On, Xe] = V(!1)
function _t(e) {
  let t
  return k && k.context && (t = k.context[e.id]) !== void 0 ? t : e.defaultValue
}
var Ve
function st() {
  let e = g && g.running
  if (this.sources && (e ? this.tState : this.state))
    if ((e ? this.tState : this.state) === Q) Oe(this)
    else {
      let t = U
      ;((U = null), te(() => Pe(this), !1), (U = t))
    }
  if (T) {
    let t = this.observers
    if (!t || t[t.length - 1] !== T) {
      let n = t ? t.length : 0
      ;(T.sources
        ? (T.sources.push(this), T.sourceSlots.push(n))
        : ((T.sources = [this]), (T.sourceSlots = [n])),
        t
          ? (t.push(T), this.observerSlots.push(T.sources.length - 1))
          : ((this.observers = [T]), (this.observerSlots = [T.sources.length - 1])))
    }
  }
  return e && g.sources.has(this) ? this.tValue : this.value
}
function it(e, t, n) {
  let r = g && g.running && g.sources.has(e) ? e.tValue : e.value
  if (!e.comparator || !e.comparator(r, t)) {
    if (g) {
      let i = g.running
      ;((i || (!n && g.sources.has(e))) && (g.sources.add(e), (e.tValue = t)), i || (e.value = t))
    } else e.value = t
    e.observers &&
      e.observers.length &&
      te(() => {
        for (let i = 0; i < e.observers.length; i += 1) {
          let s = e.observers[i],
            l = g && g.running
          ;(l && g.disposed.has(s)) ||
            ((l ? !s.tState : !s.state) && (s.pure ? U.push(s) : W.push(s), s.observers && lt(s)),
            l ? (s.tState = Q) : (s.state = Q))
        }
        if (U.length > 1e6) throw ((U = []), new Error())
      }, !1)
  }
  return t
}
function Oe(e) {
  if (!e.fn) return
  ae(e)
  let t = Te
  ;(Je(e, g && g.running && g.sources.has(e) ? e.tValue : e.value, t),
    g &&
      !g.running &&
      g.sources.has(e) &&
      queueMicrotask(() => {
        te(() => {
          ;(g && (g.running = !0), (T = k = e), Je(e, e.tValue, t), (T = k = null))
        }, !1)
      }))
}
function Je(e, t, n) {
  let r,
    i = k,
    s = T
  T = k = e
  try {
    r = e.fn(t)
  } catch (l) {
    return (
      e.pure &&
        (g && g.running
          ? ((e.tState = Q), e.tOwned && e.tOwned.forEach(ae), (e.tOwned = void 0))
          : ((e.state = Q), e.owned && e.owned.forEach(ae), (e.owned = null))),
      (e.updatedAt = n + 1),
      qe(l)
    )
  } finally {
    ;((T = s), (k = i))
  }
  ;(!e.updatedAt || e.updatedAt <= n) &&
    (e.updatedAt != null && 'observers' in e
      ? it(e, r, !0)
      : g && g.running && e.pure
        ? (g.sources.has(e) || (e.value = r), g.sources.add(e), (e.tValue = r))
        : (e.value = r),
    (e.updatedAt = n))
}
function Be(e, t, n, r = Q, i) {
  let s = {
    fn: e,
    state: r,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: t,
    owner: k,
    context: k ? k.context : null,
    pure: n,
  }
  if (
    (g && g.running && ((s.state = 0), (s.tState = r)),
    k === null ||
      (k !== nt &&
        (g && g.running && k.pure
          ? k.tOwned
            ? k.tOwned.push(s)
            : (k.tOwned = [s])
          : k.owned
            ? k.owned.push(s)
            : (k.owned = [s]))),
    ge && s.fn)
  ) {
    let l = s.fn,
      [o, a] = V(void 0, { equals: !1 }),
      u = ge.factory(l, a)
    de(() => u.dispose())
    let c,
      d = () =>
        Et(a).then(() => {
          c && (c.dispose(), (c = void 0))
        })
    s.fn = (p) => (o(), g && g.running ? (c || (c = ge.factory(l, d)), c.track(p)) : u.track(p))
  }
  return s
}
function Se(e) {
  let t = g && g.running
  if ((t ? e.tState : e.state) === 0) return
  if ((t ? e.tState : e.state) === Ce) return Pe(e)
  if (e.suspense && Z(e.suspense.inFallback)) return e.suspense.effects.push(e)
  let n = [e]
  for (; (e = e.owner) && (!e.updatedAt || e.updatedAt < Te);) {
    if (t && g.disposed.has(e)) return
    ;(t ? e.tState : e.state) && n.push(e)
  }
  for (let r = n.length - 1; r >= 0; r--) {
    if (((e = n[r]), t)) {
      let i = e,
        s = n[r + 1]
      for (; (i = i.owner) && i !== s;) if (g.disposed.has(i)) return
    }
    if ((t ? e.tState : e.state) === Q) Oe(e)
    else if ((t ? e.tState : e.state) === Ce) {
      let i = U
      ;((U = null), te(() => Pe(e, n[0]), !1), (U = i))
    }
  }
}
function te(e, t) {
  if (U) return e()
  let n = !1
  ;(t || (U = []), W ? (n = !0) : (W = []), Te++)
  try {
    let r = e()
    return (At(n), r)
  } catch (r) {
    ;(n || (W = null), (U = null), qe(r))
  }
}
function At(e) {
  if ((U && (ke && g && g.running ? Pt(U) : ot(U), (U = null)), e)) return
  let t
  if (g) {
    if (!g.promises.size && !g.queue.size) {
      let r = g.sources,
        i = g.disposed
      ;(W.push.apply(W, g.effects), (t = g.resolve))
      for (let s of W) ('tState' in s && (s.state = s.tState), delete s.tState)
      ;((g = null),
        te(() => {
          for (let s of i) ae(s)
          for (let s of r) {
            if (((s.value = s.tValue), s.owned))
              for (let l = 0, o = s.owned.length; l < o; l++) ae(s.owned[l])
            ;(s.tOwned && (s.owned = s.tOwned), delete s.tValue, delete s.tOwned, (s.tState = 0))
          }
          Xe(!1)
        }, !1))
    } else if (g.running) {
      ;((g.running = !1), g.effects.push.apply(g.effects, W), (W = null), Xe(!0))
      return
    }
  }
  let n = W
  ;((W = null), n.length && te(() => tt(n), !1), t && t())
}
function ot(e) {
  for (let t = 0; t < e.length; t++) Se(e[t])
}
function Pt(e) {
  for (let t = 0; t < e.length; t++) {
    let n = e[t],
      r = g.queue
    r.has(n) ||
      (r.add(n),
      ke(() => {
        ;(r.delete(n),
          te(() => {
            ;((g.running = !0), Se(n))
          }, !1),
          g && (g.running = !1))
      }))
  }
}
function Tt(e) {
  let t,
    n = 0
  for (t = 0; t < e.length; t++) {
    let r = e[t]
    r.user ? (e[n++] = r) : Se(r)
  }
  if (N.context) {
    if (N.count) {
      ;(N.effects || (N.effects = []), N.effects.push(...e.slice(0, n)))
      return
    }
    Fe()
  }
  for (
    N.effects &&
      (N.done || !N.count) &&
      ((e = [...N.effects, ...e]), (n += N.effects.length), delete N.effects),
      t = 0;
    t < n;
    t++
  )
    Se(e[t])
}
function Pe(e, t) {
  let n = g && g.running
  n ? (e.tState = 0) : (e.state = 0)
  for (let r = 0; r < e.sources.length; r += 1) {
    let i = e.sources[r]
    if (i.sources) {
      let s = n ? i.tState : i.state
      s === Q ? i !== t && (!i.updatedAt || i.updatedAt < Te) && Se(i) : s === Ce && Pe(i, t)
    }
  }
}
function lt(e) {
  let t = g && g.running
  for (let n = 0; n < e.observers.length; n += 1) {
    let r = e.observers[n]
    ;(t ? !r.tState : !r.state) &&
      (t ? (r.tState = Ce) : (r.state = Ce), r.pure ? U.push(r) : W.push(r), r.observers && lt(r))
  }
}
function ae(e) {
  let t
  if (e.sources)
    for (; e.sources.length;) {
      let n = e.sources.pop(),
        r = e.sourceSlots.pop(),
        i = n.observers
      if (i && i.length) {
        let s = i.pop(),
          l = n.observerSlots.pop()
        r < i.length && ((s.sourceSlots[l] = r), (i[r] = s), (n.observerSlots[r] = l))
      }
    }
  if (e.tOwned) {
    for (t = e.tOwned.length - 1; t >= 0; t--) ae(e.tOwned[t])
    delete e.tOwned
  }
  if (g && g.running && e.pure) ct(e, !0)
  else if (e.owned) {
    for (t = e.owned.length - 1; t >= 0; t--) ae(e.owned[t])
    e.owned = null
  }
  if (e.cleanups) {
    for (t = e.cleanups.length - 1; t >= 0; t--) e.cleanups[t]()
    e.cleanups = null
  }
  g && g.running ? (e.tState = 0) : (e.state = 0)
}
function ct(e, t) {
  if ((t || ((e.tState = 0), g.disposed.add(e)), e.owned))
    for (let n = 0; n < e.owned.length; n++) ct(e.owned[n])
}
function Lt(e) {
  return e instanceof Error
    ? e
    : new Error(typeof e == 'string' ? e : 'Unknown error', { cause: e })
}
function Ze(e, t, n) {
  try {
    for (let r of t) r(e)
  } catch (r) {
    qe(r, (n && n.owner) || null)
  }
}
function qe(e, t = k) {
  let n = Qe && t && t.context && t.context[Qe],
    r = Lt(e)
  if (!n) throw r
  W
    ? W.push({
        fn() {
          Ze(r, n, t)
        },
        state: Q,
      })
    : Ze(r, n, t)
}
var Dt = Symbol('fallback')
function et(e) {
  for (let t = 0; t < e.length; t++) e[t]()
}
function It(e, t, n = {}) {
  let r = [],
    i = [],
    s = [],
    l = 0,
    o = t.length > 1 ? [] : null
  return (
    de(() => et(s)),
    () => {
      let a = e() || [],
        u = a.length,
        c,
        d
      return (
        a[$e],
        Z(() => {
          let f, m, b, x, M, O, j, E, K
          if (u === 0)
            (l !== 0 && (et(s), (s = []), (r = []), (i = []), (l = 0), o && (o = [])),
              n.fallback && ((r = [Dt]), (i[0] = ve((J) => ((s[0] = J), n.fallback()))), (l = 1)))
          else if (l === 0) {
            for (i = new Array(u), d = 0; d < u; d++) ((r[d] = a[d]), (i[d] = ve(p)))
            l = u
          } else {
            for (
              b = new Array(u),
                x = new Array(u),
                o && (M = new Array(u)),
                O = 0,
                j = Math.min(l, u);
              O < j && r[O] === a[O];
              O++
            );
            for (j = l - 1, E = u - 1; j >= O && E >= O && r[j] === a[E]; j--, E--)
              ((b[E] = i[j]), (x[E] = s[j]), o && (M[E] = o[j]))
            for (f = new Map(), m = new Array(E + 1), d = E; d >= O; d--)
              ((K = a[d]), (c = f.get(K)), (m[d] = c === void 0 ? -1 : c), f.set(K, d))
            for (c = O; c <= j; c++)
              ((K = r[c]),
                (d = f.get(K)),
                d !== void 0 && d !== -1
                  ? ((b[d] = i[c]), (x[d] = s[c]), o && (M[d] = o[c]), (d = m[d]), f.set(K, d))
                  : s[c]())
            for (d = O; d < u; d++)
              d in b
                ? ((i[d] = b[d]), (s[d] = x[d]), o && ((o[d] = M[d]), o[d](d)))
                : (i[d] = ve(p))
            ;((i = i.slice(0, (l = u))), (r = a.slice(0)))
          }
          return i
        })
      )
      function p(f) {
        if (((s[d] = f), o)) {
          let [m, b] = V(d)
          return ((o[d] = b), t(a[d], m))
        }
        return t(a[d])
      }
    }
  )
}
var Nt = !1
function S(e, t) {
  if (Nt && N.context) {
    let n = N.context
    Fe($t())
    let r = Z(() => e(t || {}))
    return (Fe(n), r)
  }
  return Z(() => e(t || {}))
}
var Mt = (e) => `Stale read from <${e}>.`
function H(e) {
  let t = 'fallback' in e && { fallback: () => e.fallback }
  return ie(It(() => e.each, e.children, t || void 0))
}
function ee(e) {
  let t = e.keyed,
    n = ie(() => e.when, void 0, void 0),
    r = t ? n : ie(n, void 0, { equals: (i, s) => !i == !s })
  return ie(
    () => {
      let i = r()
      if (i) {
        let s = e.children
        return typeof s == 'function' && s.length > 0
          ? Z(() =>
              s(
                t
                  ? i
                  : () => {
                      if (!Z(r)) throw Mt('Show')
                      return n()
                    }
              )
            )
          : s
      }
      return e.fallback
    },
    void 0,
    void 0
  )
}
var Rt = [
    'allowfullscreen',
    'async',
    'alpha',
    'autofocus',
    'autoplay',
    'checked',
    'controls',
    'default',
    'disabled',
    'formnovalidate',
    'hidden',
    'indeterminate',
    'inert',
    'ismap',
    'loop',
    'multiple',
    'muted',
    'nomodule',
    'novalidate',
    'open',
    'playsinline',
    'readonly',
    'required',
    'reversed',
    'seamless',
    'selected',
    'adauctionheaders',
    'browsingtopics',
    'credentialless',
    'defaultchecked',
    'defaultmuted',
    'defaultselected',
    'defer',
    'disablepictureinpicture',
    'disableremoteplayback',
    'preservespitch',
    'shadowrootclonable',
    'shadowrootcustomelementregistry',
    'shadowrootdelegatesfocus',
    'shadowrootserializable',
    'sharedstoragewritable',
  ],
  Fn = new Set([
    'className',
    'value',
    'readOnly',
    'noValidate',
    'formNoValidate',
    'isMap',
    'noModule',
    'playsInline',
    'adAuctionHeaders',
    'allowFullscreen',
    'browsingTopics',
    'defaultChecked',
    'defaultMuted',
    'defaultSelected',
    'disablePictureInPicture',
    'disableRemotePlayback',
    'preservesPitch',
    'shadowRootClonable',
    'shadowRootCustomElementRegistry',
    'shadowRootDelegatesFocus',
    'shadowRootSerializable',
    'sharedStorageWritable',
    ...Rt,
  ])
function Ft(e, t, n) {
  let r = n.length,
    i = t.length,
    s = r,
    l = 0,
    o = 0,
    a = t[i - 1].nextSibling,
    u = null
  for (; l < i || o < s;) {
    if (t[l] === n[o]) {
      ;(l++, o++)
      continue
    }
    for (; t[i - 1] === n[s - 1];) (i--, s--)
    if (i === l) {
      let c = s < r ? (o ? n[o - 1].nextSibling : n[s - o]) : a
      for (; o < s;) e.insertBefore(n[o++], c)
    } else if (s === o) for (; l < i;) ((!u || !u.has(t[l])) && t[l].remove(), l++)
    else if (t[l] === n[s - 1] && n[o] === t[i - 1]) {
      let c = t[--i].nextSibling
      ;(e.insertBefore(n[o++], t[l++].nextSibling), e.insertBefore(n[--s], c), (t[i] = n[s]))
    } else {
      if (!u) {
        u = new Map()
        let d = o
        for (; d < s;) u.set(n[d], d++)
      }
      let c = u.get(t[l])
      if (c != null)
        if (o < c && c < s) {
          let d = l,
            p = 1,
            f
          for (; ++d < i && d < s && !((f = u.get(t[d])) == null || f !== c + p);) p++
          if (p > c - o) {
            let m = t[l]
            for (; o < c;) e.insertBefore(n[o++], m)
          } else e.replaceChild(n[o++], t[l++])
        } else l++
      else t[l++].remove()
    }
  }
}
var at = '_$DX_DELEGATE'
function Ue(e, t, n, r = {}) {
  let i
  return (
    ve((s) => {
      ;((i = s), t === document ? e() : h(t, e(), t.firstChild ? null : void 0, n))
    }, r.owner),
    () => {
      ;(i(), (t.textContent = ''))
    }
  )
}
function P(e, t, n, r) {
  let i,
    s = () => {
      let o = r
        ? document.createElementNS('http://www.w3.org/1998/Math/MathML', 'template')
        : document.createElement('template')
      return (
        (o.innerHTML = e),
        n ? o.content.firstChild.firstChild : r ? o.firstChild : o.content.firstChild
      )
    },
    l = t
      ? () => Z(() => document.importNode(i || (i = s()), !0))
      : () => (i || (i = s())).cloneNode(!0)
  return ((l.cloneNode = l), l)
}
function dt(e, t = window.document) {
  let n = t[at] || (t[at] = new Set())
  for (let r = 0, i = e.length; r < i; r++) {
    let s = e[r]
    n.has(s) || (n.add(s), t.addEventListener(s, Vt))
  }
}
function ne(e, t, n) {
  Ke(e) || (n == null ? e.removeAttribute(t) : e.setAttribute(t, n))
}
function F(e, t) {
  Ke(e) || (t == null ? e.removeAttribute('class') : (e.className = t))
}
function X(e, t, n) {
  n != null ? e.style.setProperty(t, n) : e.style.removeProperty(t)
}
function h(e, t, n, r) {
  if ((n !== void 0 && !r && (r = []), typeof t != 'function')) return Ie(e, t, r, n)
  L((i) => Ie(e, t(), i, n), r)
}
function Ke(e) {
  return !!N.context && !N.done && (!e || e.isConnected)
}
function Vt(e) {
  if (N.registry && N.events && N.events.find(([a, u]) => u === e)) return
  let t = e.target,
    n = `$$${e.type}`,
    r = e.target,
    i = e.currentTarget,
    s = (a) => Object.defineProperty(e, 'target', { configurable: !0, value: a }),
    l = () => {
      let a = t[n]
      if (a && !t.disabled) {
        let u = t[`${n}Data`]
        if ((u !== void 0 ? a.call(t, u, e) : a.call(t, e), e.cancelBubble)) return
      }
      return (
        t.host && typeof t.host != 'string' && !t.host._$host && t.contains(e.target) && s(t.host),
        !0
      )
    },
    o = () => {
      for (; l() && (t = t._$host || t.parentNode || t.host););
    }
  if (
    (Object.defineProperty(e, 'currentTarget', {
      configurable: !0,
      get() {
        return t || document
      },
    }),
    N.registry && !N.done && (N.done = _$HY.done = !0),
    e.composedPath)
  ) {
    let a = e.composedPath()
    s(a[0])
    for (let u = 0; u < a.length - 2 && ((t = a[u]), !!l()); u++) {
      if (t._$host) {
        ;((t = t._$host), o())
        break
      }
      if (t.parentNode === i) break
    }
  } else o()
  s(r)
}
function Ie(e, t, n, r, i) {
  let s = Ke(e)
  if (s) {
    !n && (n = [...e.childNodes])
    let a = []
    for (let u = 0; u < n.length; u++) {
      let c = n[u]
      c.nodeType === 8 && c.data.slice(0, 2) === '!$' ? c.remove() : a.push(c)
    }
    n = a
  }
  for (; typeof n == 'function';) n = n()
  if (t === n) return n
  let l = typeof t,
    o = r !== void 0
  if (((e = (o && n[0] && n[0].parentNode) || e), l === 'string' || l === 'number')) {
    if (s || (l === 'number' && ((t = t.toString()), t === n))) return n
    if (o) {
      let a = n[0]
      ;(a && a.nodeType === 3 ? a.data !== t && (a.data = t) : (a = document.createTextNode(t)),
        (n = he(e, n, r, a)))
    } else n !== '' && typeof n == 'string' ? (n = e.firstChild.data = t) : (n = e.textContent = t)
  } else if (t == null || l === 'boolean') {
    if (s) return n
    n = he(e, n, r)
  } else {
    if (l === 'function')
      return (
        L(() => {
          let a = t()
          for (; typeof a == 'function';) a = a()
          n = Ie(e, a, n, r)
        }),
        () => n
      )
    if (Array.isArray(t)) {
      let a = [],
        u = n && Array.isArray(n)
      if (He(a, t, n, i)) return (L(() => (n = Ie(e, a, n, r, !0))), () => n)
      if (s) {
        if (!a.length) return n
        if (r === void 0) return (n = [...e.childNodes])
        let c = a[0]
        if (c.parentNode !== e) return n
        let d = [c]
        for (; (c = c.nextSibling) !== r;) d.push(c)
        return (n = d)
      }
      if (a.length === 0) {
        if (((n = he(e, n, r)), o)) return n
      } else u ? (n.length === 0 ? ut(e, a, r) : Ft(e, n, a)) : (n && he(e), ut(e, a))
      n = a
    } else if (t.nodeType) {
      if (s && t.parentNode) return (n = o ? [t] : t)
      if (Array.isArray(n)) {
        if (o) return (n = he(e, n, r, t))
        he(e, n, null, t)
      } else
        n == null || n === '' || !e.firstChild ? e.appendChild(t) : e.replaceChild(t, e.firstChild)
      n = t
    }
  }
  return n
}
function He(e, t, n, r) {
  let i = !1
  for (let s = 0, l = t.length; s < l; s++) {
    let o = t[s],
      a = n && n[e.length],
      u
    if (!(o == null || o === !0 || o === !1))
      if ((u = typeof o) == 'object' && o.nodeType) e.push(o)
      else if (Array.isArray(o)) i = He(e, o, a) || i
      else if (u === 'function')
        if (r) {
          for (; typeof o == 'function';) o = o()
          i = He(e, Array.isArray(o) ? o : [o], Array.isArray(a) ? a : [a]) || i
        } else (e.push(o), (i = !0))
      else {
        let c = String(o)
        a && a.nodeType === 3 && a.data === c ? e.push(a) : e.push(document.createTextNode(c))
      }
  }
  return i
}
function ut(e, t, n = null) {
  for (let r = 0, i = t.length; r < i; r++) e.insertBefore(t[r], n)
}
function he(e, t, n, r) {
  if (n === void 0) return (e.textContent = '')
  let i = r || document.createTextNode('')
  if (t.length) {
    let s = !1
    for (let l = t.length - 1; l >= 0; l--) {
      let o = t[l]
      if (i !== o) {
        let a = o.parentNode === e
        !s && !l ? (a ? e.replaceChild(i, o) : e.insertBefore(i, n)) : a && o.remove()
      } else s = !0
    }
  } else e.insertBefore(i, n)
  return [i]
}
var Bt = P(
    '<div class="flex-1 sch-scroll bg-gray-50 border border-gray-200 rounded-sm shadow-sm"><div class=sch-head><div class="grid-expert border-b border-gray-200 bg-gray-100"><div class="sch-col-fix p-1.5 border-r border-gray-200 bg-gray-100"></div></div><div class="grid-expert border-b border-gray-300 bg-gray-50"><div class="sch-col-fix p-2 border-r border-gray-200 bg-gray-50 flex items-center justify-between"><span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mono">Ressource / Ligne</span><span class="material-symbols-outlined text-gray-300 text-sm">unfold_more</span></div></div></div><div class=bg-gray-50>'
  ),
  qt = P(
    '<div class="p-1.5 text-center border-r border-gray-200"><span class="text-[10px] font-bold uppercase tracking-widest mono text-gray-500">Semaine '
  ),
  Ht = P('<div><div></div><div class=mt-1><span>h'),
  Ut = P(
    '<div class="mb-2 sch-hist"><div class="flex items-end gap-1 h-10 relative"><div class="absolute left-0 right-0 border-t border-dashed border-gray-300"style=top:0></div></div><div class="flex gap-1 mt-0.5">'
  ),
  Kt = P(
    '<div class="sch-row grid-expert border-b border-gray-200 min-h-[120px]"><div class="sch-col-fix p-3 border-r border-gray-200 bg-white flex flex-col"><div class="flex items-center gap-1.5 mb-2"><div></div><span class="text-xs font-bold text-gray-900 uppercase tracking-tight"></span></div><div class="mt-auto space-y-1">'
  ),
  Wt = P('<div class="flex-1 flex flex-col justify-end h-full"><div style=min-height:2px>'),
  Gt = P('<div>h'),
  Yt = P(
    '<div class="flex justify-between text-[10px] text-gray-400 mono"><span>:</span><span class="text-gray-600 font-bold">'
  ),
  zt = P('<div>'),
  ft = P('<span>'),
  Qt = P(
    '<a up-layer="new drawer"up-position=right up-target=#sch-detail-panel><div class="flex items-baseline justify-between gap-1.5"><span class="flex items-baseline gap-1 min-w-0"><span></span></span></div><p>'
  ),
  Xt = P('<span><span class=material-symbols-outlined>')
function We(e) {
  let { store: t } = e,
    [n, r] = V(null),
    [i, s] = V(null)
  return (
    Le(() => {
      let l = (c) => {
          let d = c.target
          d?.id === 'board-search' && t.onQueryInput(d.value)
        },
        o = (c) => {
          let d = c.target
          d?.id === 'board-search-scope' && t.onScopeChange(d.value)
        },
        a = (c) => {
          let d = document.getElementById('board-search')
          d &&
            ((c.metaKey || c.ctrlKey) && c.key.toLowerCase() === 'k'
              ? (c.preventDefault(), d.focus(), d.select())
              : c.key === 'Escape' &&
                document.activeElement === d &&
                ((d.value = ''), t.clearSearch(), d.blur()))
        },
        u = (c) => {
          let d = c.target,
            p = d.closest('[data-mode-btn]')
          if (p) {
            t.setMode(p.getAttribute('data-mode-btn'))
            return
          }
          if (d.closest('#btn-feasibility')) {
            let f = document.getElementById('board-root')
            if (!f) return
            t.runFeasibility(f.getAttribute('data-from') ?? '', f.getAttribute('data-to') ?? '')
          }
        }
      ;(document.addEventListener('input', l),
        document.addEventListener('change', o),
        document.addEventListener('click', u),
        window.addEventListener('keydown', a),
        de(() => {
          ;(document.removeEventListener('input', l),
            document.removeEventListener('change', o),
            document.removeEventListener('click', u),
            window.removeEventListener('keydown', a))
        }))
    }),
    ue(() => {
      let l = t.mode()
      ;(document.querySelectorAll('#mode-toggle [data-mode-btn]').forEach((o) => {
        let a = o.getAttribute('data-mode-btn') === l
        ;(o.classList.toggle('bg-white', a),
          o.classList.toggle('shadow-sm', a),
          o.classList.toggle('text-primary', a),
          o.classList.toggle('text-gray-400', !a))
      }),
        document.getElementById('mode-toggle')?.setAttribute('data-mode', l))
    }),
    ue(() => {
      let l = t.feasLoading(),
        o = document.getElementById('btn-feasibility'),
        a = document.getElementById('feas-icon'),
        u = document.getElementById('feas-label')
      !o ||
        !a ||
        !u ||
        ((o.disabled = l),
        (u.textContent = l ? 'Calcul\u2026' : 'Calculer faisabilit\xE9'),
        a.classList.toggle('animate-spin', l),
        (a.textContent = l ? 'progress_activity' : 'fact_check'))
    }),
    (() => {
      var l = Bt(),
        o = l.firstChild,
        a = o.firstChild,
        u = a.firstChild,
        c = a.nextSibling,
        d = c.firstChild,
        p = o.nextSibling
      return (
        h(
          a,
          S(H, {
            get each() {
              return t.board.weekSpans
            },
            children: (f) =>
              (() => {
                var m = qt(),
                  b = m.firstChild,
                  x = b.firstChild
                return (
                  h(b, () => f.week, null),
                  L((M) => X(m, 'grid-column', `span ${f.span}`)),
                  m
                )
              })(),
          }),
          null
        ),
        h(
          c,
          S(H, {
            get each() {
              return t.board.days
            },
            children: (f, m) =>
              (() => {
                var b = Ht(),
                  x = b.firstChild,
                  M = x.nextSibling,
                  O = M.firstChild,
                  j = O.firstChild
                return (
                  h(x, () => f.short),
                  h(O, () => Math.round(t.dayLoad()[m()] * 10) / 10, j),
                  L(
                    (E) => {
                      var K = `p-2 border-r border-gray-200 text-center ${f.headerTone}`,
                        J = `text-[10px] font-bold uppercase mono ${f.today ? 'text-primary' : 'text-gray-400'}`,
                        le = `text-[11px] font-bold mono ${f.valClass}`
                      return (
                        K !== E.e && F(b, (E.e = K)),
                        J !== E.t && F(x, (E.t = J)),
                        le !== E.a && F(O, (E.a = le)),
                        E
                      )
                    },
                    { e: void 0, t: void 0, a: void 0 }
                  ),
                  b
                )
              })(),
          }),
          null
        ),
        h(
          p,
          S(H, {
            get each() {
              return t.board.lines
            },
            children: (f) =>
              S(Jt, {
                store: t,
                line: f,
                draggedNumOf: n,
                setDraggedNumOf: r,
                dropCol: i,
                setDropCol: s,
              }),
          })
        ),
        L((f) => X(l, '--cols', String(t.board.cols))),
        l
      )
    })()
  )
}
function Jt(e) {
  let { store: t, line: n } = e
  return (() => {
    var r = Kt(),
      i = r.firstChild,
      s = i.firstChild,
      l = s.firstChild,
      o = l.nextSibling,
      a = s.nextSibling
    return (
      h(o, () => n.name),
      h(
        i,
        S(ee, {
          get when() {
            return t.lineWeekLoads(n.code).length > 0
          },
          get children() {
            var u = Ut(),
              c = u.firstChild,
              d = c.firstChild,
              p = c.nextSibling
            return (
              h(
                c,
                S(H, {
                  get each() {
                    return t.lineWeekLoads(n.code)
                  },
                  children: (f) =>
                    (() => {
                      var m = Wt(),
                        b = m.firstChild
                      return (
                        L(
                          (x) => {
                            var M = `S${f.week} \u2014 ${f.hours}h (${f.pct}%)`,
                              O = `w-full rounded-sm ${f.barClass}`,
                              j = `${f.pct > 100 ? 100 : f.pct}%`
                            return (
                              M !== x.e && ne(m, 'title', (x.e = M)),
                              O !== x.t && F(b, (x.t = O)),
                              j !== x.a && X(b, 'height', (x.a = j)),
                              x
                            )
                          },
                          { e: void 0, t: void 0, a: void 0 }
                        ),
                        m
                      )
                    })(),
                }),
                null
              ),
              h(
                p,
                S(H, {
                  get each() {
                    return t.lineWeekLoads(n.code)
                  },
                  children: (f) =>
                    (() => {
                      var m = Gt(),
                        b = m.firstChild
                      return (
                        h(m, () => f.hours, b),
                        L(() =>
                          F(
                            m,
                            `flex-1 text-center text-[8px] font-bold mono ${f.pct > 100 ? 'text-error' : 'text-gray-400'}`
                          )
                        ),
                        m
                      )
                    })(),
                })
              ),
              u
            )
          },
        }),
        a
      ),
      h(
        a,
        S(H, {
          get each() {
            return n.meta
          },
          children: (u) =>
            (() => {
              var c = Yt(),
                d = c.firstChild,
                p = d.firstChild,
                f = d.nextSibling
              return (h(d, () => u.k, p), h(f, () => u.v), c)
            })(),
        })
      ),
      h(
        r,
        S(H, {
          get each() {
            return n.dayCells
          },
          children: (u, c) =>
            S(Zt, {
              store: t,
              line: n,
              dc: u,
              get col() {
                return c()
              },
              get draggedNumOf() {
                return e.draggedNumOf
              },
              get setDraggedNumOf() {
                return e.setDraggedNumOf
              },
              get dropCol() {
                return e.dropCol
              },
              get setDropCol() {
                return e.setDropCol
              },
            }),
        }),
        null
      ),
      L(
        (u) => {
          var c = t.lineVisible(n.code) ? '' : 'none',
            d = `w-2 h-2 rounded-full ${n.dot}`
          return (c !== u.e && X(r, 'display', (u.e = c)), d !== u.t && F(l, (u.t = d)), u)
        },
        { e: void 0, t: void 0 }
      ),
      r
    )
  })()
}
function Zt(e) {
  let { store: t, line: n, dc: r, col: i } = e,
    s = `${n.code}:${i}`
  return (() => {
    var l = zt()
    return (
      l.addEventListener('drop', (o) => {
        let a = e.draggedNumOf()
        ;(e.setDropCol(null), a && (o.preventDefault(), t.moveCard(a, n.code, i, r.iso)))
      }),
      l.addEventListener('dragover', (o) => {
        e.draggedNumOf() &&
          (o.preventDefault(),
          o.dataTransfer && (o.dataTransfer.dropEffect = 'move'),
          e.setDropCol(s))
      }),
      h(
        l,
        S(H, {
          get each() {
            return r.cards
          },
          children: (o) =>
            S(en, {
              store: t,
              card: o,
              line: n,
              get setDraggedNumOf() {
                return e.setDraggedNumOf
              },
              get setDropCol() {
                return e.setDropCol
              },
            }),
        })
      ),
      L(
        (o) => {
          var a = `sch-cal-cell p-1.5 border-r border-gray-200 flex flex-col gap-1.5 ${r.cellClass}`,
            u = e.dropCol() === s
          return (
            a !== o.e && F(l, (o.e = a)),
            u !== o.t && l.classList.toggle('is-drop', (o.t = u)),
            o
          )
        },
        { e: void 0, t: void 0 }
      ),
      l
    )
  })()
}
function en(e) {
  let { store: t, card: n, line: r } = e,
    i = () => t.cardMatches(n, r.code)
  return (() => {
    var s = Qt(),
      l = s.firstChild,
      o = l.firstChild,
      a = o.firstChild,
      u = l.nextSibling
    return (
      s.addEventListener('dragend', () => {
        ;(e.setDraggedNumOf(null), e.setDropCol(null))
      }),
      s.addEventListener('dragstart', (c) => {
        ;(e.setDraggedNumOf(n.id),
          c.dataTransfer &&
            ((c.dataTransfer.effectAllowed = 'move'), c.dataTransfer.setData('text/plain', n.id)))
      }),
      h(a, () => n.id),
      h(
        o,
        S(ee, {
          get when() {
            return n.article
          },
          get children() {
            var c = ft()
            return (
              h(c, () => n.article),
              L(() => F(c, `mono text-[9px] ${n.fieldValTone} truncate`)),
              c
            )
          },
        }),
        null
      ),
      h(
        l,
        S(ee, {
          get when() {
            return n.metric
          },
          get children() {
            var c = ft()
            return (
              h(c, () => n.metric),
              L(() => F(c, `mono text-[10px] font-semibold ${n.fieldValTone} shrink-0`)),
              c
            )
          },
        }),
        null
      ),
      h(u, () => n.title),
      h(
        s,
        S(ee, {
          get when() {
            return t.feasOf(n.id)
          },
          children: (c) =>
            (() => {
              var d = Xt(),
                p = d.firstChild
              return (
                h(p, () => (c().st === 'blocked' ? 'priority_high' : 'check')),
                L(
                  (f) => {
                    var m = `sch-feas-badge ${c().st === 'blocked' ? 'is-blocked' : 'is-ok'}`,
                      b =
                        c().st === 'blocked'
                          ? `OF non r\xE9alisable \u2014 rupture : ${c().missing.length ? c().missing.join(', ') : 'composant'}`
                          : 'OF r\xE9alisable'
                    return (m !== f.e && F(d, (f.e = m)), b !== f.t && ne(d, 'title', (f.t = b)), f)
                  },
                  { e: void 0, t: void 0 }
                ),
                d
              )
            })(),
        }),
        null
      ),
      L(
        (c) => {
          var d = n.href,
            p = i(),
            f = n.id,
            m = `sch-of-card relative block bg-white border border-gray-200 rounded p-1.5 ${n.accentClass} ${n.cardClass}`,
            b = i() ? '' : '0.15',
            x = `mono text-[10px] font-bold ${n.idTone} truncate`,
            M = `text-[12px] font-semibold leading-tight truncate ${n.textTone}`
          return (
            d !== c.e && ne(s, 'href', (c.e = d)),
            p !== c.t && ne(s, 'draggable', (c.t = p)),
            f !== c.a && ne(s, 'data-num-of', (c.a = f)),
            m !== c.o && F(s, (c.o = m)),
            b !== c.i && X(s, 'opacity', (c.i = b)),
            x !== c.n && F(a, (c.n = x)),
            M !== c.s && F(u, (c.s = M)),
            c
          )
        },
        { e: void 0, t: void 0, a: void 0, o: void 0, i: void 0, n: void 0, s: void 0 }
      ),
      s
    )
  })()
}
var Ne = Symbol('store-raw'),
  fe = Symbol('store-node'),
  re = Symbol('store-has'),
  gt = Symbol('store-self')
function ht(e) {
  let t = e[oe]
  if (!t && (Object.defineProperty(e, oe, { value: (t = new Proxy(e, rn)) }), !Array.isArray(e))) {
    let n = Object.keys(e),
      r = Object.getOwnPropertyDescriptors(e),
      i = Object.getPrototypeOf(e),
      s =
        i !== null &&
        e !== null &&
        typeof e == 'object' &&
        !Array.isArray(e) &&
        i !== Object.prototype
    if (s) {
      let l = Object.getOwnPropertyDescriptors(i)
      ;(n.push(...Object.keys(l)), Object.assign(r, l))
    }
    for (let l = 0, o = n.length; l < o; l++) {
      let a = n[l]
      ;(s && a === 'constructor') ||
        (r[a].get &&
          Object.defineProperty(e, a, {
            configurable: !0,
            enumerable: r[a].enumerable,
            get: r[a].get.bind(t),
          }))
    }
  }
  return t
}
function me(e) {
  let t
  return (
    e != null &&
    typeof e == 'object' &&
    (e[oe] || !(t = Object.getPrototypeOf(e)) || t === Object.prototype || Array.isArray(e))
  )
}
function be(e, t = new Set()) {
  let n, r, i, s
  if ((n = e != null && e[Ne])) return n
  if (!me(e) || t.has(e)) return e
  if (Array.isArray(e)) {
    Object.isFrozen(e) ? (e = e.slice(0)) : t.add(e)
    for (let l = 0, o = e.length; l < o; l++) ((i = e[l]), (r = be(i, t)) !== i && (e[l] = r))
  } else {
    Object.isFrozen(e) ? (e = Object.assign({}, e)) : t.add(e)
    let l = Object.keys(e),
      o = Object.getOwnPropertyDescriptors(e)
    for (let a = 0, u = l.length; a < u; a++)
      ((s = l[a]), !o[s].get && ((i = e[s]), (r = be(i, t)) !== i && (e[s] = r)))
  }
  return e
}
function Me(e, t) {
  let n = e[t]
  return (n || Object.defineProperty(e, t, { value: (n = Object.create(null)) }), n)
}
function _e(e, t, n) {
  if (e[t]) return e[t]
  let [r, i] = V(n, { equals: !1, internal: !0 })
  return ((r.$ = i), (e[t] = r))
}
function tn(e, t) {
  let n = Reflect.getOwnPropertyDescriptor(e, t)
  return (
    !n ||
      n.get ||
      !n.configurable ||
      t === oe ||
      t === fe ||
      (delete n.value, delete n.writable, (n.get = () => e[oe][t])),
    n
  )
}
function mt(e) {
  De() && _e(Me(e, fe), gt)()
}
function nn(e) {
  return (mt(e), Reflect.ownKeys(e))
}
var rn = {
  get(e, t, n) {
    if (t === Ne) return e
    if (t === oe) return n
    if (t === $e) return (mt(e), n)
    let r = Me(e, fe),
      i = r[t],
      s = i ? i() : e[t]
    if (t === fe || t === re || t === '__proto__') return s
    if (!i) {
      let l = Object.getOwnPropertyDescriptor(e, t)
      De() &&
        (typeof s != 'function' || e.hasOwnProperty(t)) &&
        !(l && l.get) &&
        (s = _e(r, t, s)())
    }
    return me(s) ? ht(s) : s
  },
  has(e, t) {
    return t === Ne || t === oe || t === $e || t === fe || t === re || t === '__proto__'
      ? !0
      : (De() && _e(Me(e, re), t)(), t in e)
  },
  set() {
    return !0
  },
  deleteProperty() {
    return !0
  },
  ownKeys: nn,
  getOwnPropertyDescriptor: tn,
}
function pe(e, t, n, r = !1) {
  if (t === '__proto__' || (!r && e[t] === n)) return
  let i = e[t],
    s = e.length
  n === void 0
    ? (delete e[t], e[re] && e[re][t] && i !== void 0 && e[re][t].$())
    : ((e[t] = n), e[re] && e[re][t] && i === void 0 && e[re][t].$())
  let l = Me(e, fe),
    o
  if (((o = _e(l, t, i)) && o.$(() => n), Array.isArray(e) && e.length !== s)) {
    for (let a = e.length; a < s; a++) (o = l[a]) && o.$()
    ;(o = _e(l, 'length', s)) && o.$(e.length)
  }
  ;(o = l[gt]) && o.$()
}
function bt(e, t) {
  let n = Object.keys(t)
  for (let r = 0; r < n.length; r += 1) {
    let i = n[r]
    pt(i) || pe(e, i, t[i])
  }
}
function pt(e) {
  return e === '__proto__' || e === 'constructor' || e === 'prototype'
}
function sn(e, t) {
  if ((typeof t == 'function' && (t = t(e)), (t = be(t)), Array.isArray(t))) {
    if (e === t) return
    let n = 0,
      r = t.length
    for (; n < r; n++) {
      let i = t[n]
      e[n] !== i && pe(e, n, i)
    }
    pe(e, 'length', r)
  } else bt(e, t)
}
function Ee(e, t, n = []) {
  let r,
    i = e
  if (t.length > 1) {
    r = t.shift()
    let l = typeof r,
      o = Array.isArray(e)
    if (l === 'string' && (r === '__proto__' || (t.length > 1 && pt(r)))) return
    if (Array.isArray(r)) {
      for (let a = 0; a < r.length; a++) Ee(e, [r[a]].concat(t), n)
      return
    } else if (o && l === 'function') {
      for (let a = 0; a < e.length; a++) r(e[a], a) && Ee(e, [a].concat(t), n)
      return
    } else if (o && l === 'object') {
      let { from: a = 0, to: u = e.length - 1, by: c = 1 } = r
      for (let d = a; d <= u; d += c) Ee(e, [d].concat(t), n)
      return
    } else if (t.length > 1) {
      Ee(e[r], t, [r].concat(n))
      return
    }
    ;((i = e[r]), (n = [r].concat(n)))
  }
  let s = t[0]
  ;(typeof s == 'function' && ((s = s(i, n)), s === i)) ||
    (r === void 0 && s == null) ||
    ((s = be(s)), r === void 0 || (me(i) && me(s) && !Array.isArray(s)) ? bt(i, s) : pe(e, r, s))
}
function Re(...[e, t]) {
  let n = be(e || {}),
    r = Array.isArray(n),
    i = ht(n)
  function s(...l) {
    rt(() => {
      r && l.length === 1 ? sn(n, l[0]) : Ee(n, l)
    })
  }
  return [i, s]
}
var je = new WeakMap(),
  yt = {
    get(e, t) {
      if (t === Ne) return e
      let n = e[t]
      if (t === oe || t === $e || t === fe || t === re || t === '__proto__') return n
      let r
      return me(n) ? je.get(n) || (je.set(n, (r = new Proxy(n, yt))), r) : n
    },
    set(e, t, n) {
      return (pe(e, t, be(n)), !0)
    },
    deleteProperty(e, t) {
      return (pe(e, t, void 0, !0), !0)
    },
  }
function ye(e) {
  return (t) => {
    if (me(t)) {
      let n
      ;((n = je.get(t)) || je.set(t, (n = new Proxy(t, yt))), e(n))
    }
    return t
  }
}
var we = '/api/v1/planning-board',
  Ge = {
    poste: {
      url: (e) => `${we}/search/poste?q=${encodeURIComponent(e)}`,
      key: 'workstations',
      attr: (e, t) => t,
    },
    of: { url: (e) => `${we}/search/of?q=${encodeURIComponent(e)}`, key: 'ofs', attr: (e) => e.id },
    pf: {
      url: (e) => `${we}/search/pf?q=${encodeURIComponent(e)}`,
      key: 'articles',
      attr: (e) => e.article ?? '',
    },
    composant: {
      url: (e) => `${we}/articles-by-component/${encodeURIComponent(e.toUpperCase())}`,
      key: 'articles',
      attr: (e) => e.article ?? '',
    },
  }
function wt(e) {
  let [t, n] = Re(e),
    [r, i] = V(''),
    [s, l] = V('poste'),
    [o, a] = V(new Set()),
    [u, c] = V('immediate'),
    [d, p] = V({}),
    [f, m] = V(!1),
    b = (y) => d()[y],
    x = new Map(),
    M = 0
  function O(y, _) {
    if (!r().trim()) return !0
    let A = o()
    return A === null ? !1 : A.has(Ge[s()].attr(y, _))
  }
  function j(y) {
    if (!r().trim()) return !0
    let $ = o()
    if (s() === 'poste' && $ !== null && $.has(y)) return !0
    let R = t.lines.find((I) => I.code === y)
    return R ? R.dayCells.some((I) => I.cards.some((w) => O(w, y))) : !1
  }
  function E(y, _) {
    let $ = _.trim().toLowerCase()
    if (!$) {
      a(new Set())
      return
    }
    let A = `${y} ${$}`,
      R = x.get(A)
    if (R) {
      a(R)
      return
    }
    a(null)
    let I = ++M
    fetch(Ge[y].url($))
      .then((w) => (w.ok ? w.json() : Promise.resolve({})))
      .then((w) => {
        let G = new Set(w[Ge[y].key] || [])
        ;(x.set(A, G), I === M && s() === y && r().trim().toLowerCase() === $ && a(G))
      })
      .catch(() => {
        let w = new Set()
        ;(x.set(A, w), I === M && s() === y && a(w))
      })
  }
  function K(y) {
    ;(i(y), E(s(), y))
  }
  function J(y) {
    l(y)
    let _ = r()
    _.trim() && E(y, _)
  }
  function le() {
    ;(i(''), a(new Set()))
  }
  let v = ie(() => {
    let y = new Array(t.cols).fill(0)
    for (let _ of t.lines)
      j(_.code) &&
        _.dayCells.forEach(($, A) => {
          for (let R of $.cards) O(R, _.code) && (y[A] += R.hours)
        })
    return y
  })
  function D(y) {
    let _ = t.lines.find((A) => A.code === y)
    if (!_) return []
    let $ = {}
    return (
      _.dayCells.forEach((A, R) => {
        let I = t.colWeek[R]
        if (I !== void 0) for (let w of A.cards) $[I] = ($[I] ?? 0) + w.hours
      }),
      _.weekLoads.map((A) => {
        let R = Math.round(($[A.week] ?? 0) * 10) / 10,
          I = t.weekCaps[String(A.week)] ?? 0,
          w = I > 0 ? Math.round((R / I) * 100) : 0,
          G = w > 100 ? 'bg-error' : w >= 90 ? 'bg-blue-500' : 'bg-emerald-500'
        return { week: A.week, hours: R, pct: w, barClass: G }
      })
    )
  }
  function C(y, _, $, A) {
    let I = (() => {
      for (let q = 0; q < t.lines.length; q++) {
        let se = t.lines[q].dayCells
        for (let ce = 0; ce < se.length; ce++) {
          let xe = se[ce].cards.findIndex((St) => St.id === y)
          if (xe !== -1) return { line: q, col: ce, idx: xe, card: se[ce].cards[xe] }
        }
      }
      return null
    })()
    if (!I) return
    let w = t.lines.findIndex((q) => q.code === _)
    if (w === -1) return
    let { card: G } = I,
      Y = { line: I.line, col: I.col, idx: I.idx }
    ;(n(
      ye((q) => {
        ;(q.lines[Y.line].dayCells[Y.col].cards.splice(Y.idx, 1),
          q.lines[w].dayCells[$].cards.push(G))
      })
    ),
      fetch(`${we}/ofs/${encodeURIComponent(y)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstation: _, dateDebut: A }),
      })
        .then((q) => {
          if (!q.ok) throw new Error(`HTTP ${q.status}`)
        })
        .catch((q) => {
          ;(n(
            ye((se) => {
              let ce = se.lines[w].dayCells[$].cards.findIndex((xe) => xe.id === y)
              ;(ce !== -1 && se.lines[w].dayCells[$].cards.splice(ce, 1),
                se.lines[Y.line].dayCells[Y.col].cards.splice(Y.idx, 0, G))
            })
          ),
            window.dispatchEvent(
              new CustomEvent('sch-toast', { detail: `D\xE9placement \xE9chou\xE9 : ${q.message}` })
            ))
        }))
  }
  function B(y) {
    window.dispatchEvent(new CustomEvent('sch-toast', { detail: y }))
  }
  function z(y, _) {
    !y ||
      !_ ||
      f() ||
      (m(!0),
      fetch(`${we}/board-feasibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: y, to: _, mode: u() }),
      })
        .then(($) => {
          if (!$.ok) throw new Error(`HTTP ${$.status}`)
          return $.json()
        })
        .then(($) => {
          let A = {},
            R = 0,
            I = 0
          for (let w of $.ofs ?? [])
            w.feasible === !1
              ? ((A[w.numOf] = { st: 'blocked', missing: Object.keys(w.missingComponents ?? {}) }),
                I++)
              : w.feasible === !0 && ((A[w.numOf] = { st: 'ok', missing: [] }), R++)
          ;(p(A), B(I > 0 ? `${I} bloqu\xE9(s) \xB7 ${R} OK` : `${R} OF r\xE9alisables`))
        })
        .catch(($) => B(`\xC9chec : ${$.message}`))
        .finally(() => m(!1)))
  }
  return {
    board: t,
    query: r,
    scope: s,
    matchSet: o,
    mode: u,
    setMode: c,
    feasOf: b,
    feasLoading: f,
    cardMatches: O,
    lineVisible: j,
    dayLoad: v,
    lineWeekLoads: D,
    onQueryInput: K,
    onScopeChange: J,
    clearSearch: le,
    moveCard: C,
    runFeasibility: z,
  }
}
var on = P(
    '<div class="flex-1 sch-scroll bg-gray-50 border border-gray-200 rounded-sm shadow-sm"><div class=sch-head><div class="grid-expert border-b border-gray-200 bg-gray-100"><div class="sch-col-fix p-1.5 border-r border-gray-200 bg-gray-100"></div></div><div class="grid-expert border-b border-gray-300 bg-gray-50"><div class="sch-col-fix p-2 border-r border-gray-200 bg-gray-50 flex items-center justify-between"><span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mono">Poste de charge</span></div></div></div><div class=bg-gray-50>'
  ),
  ln = P(
    '<div class="p-1.5 text-center border-r border-gray-200"><span class="text-[10px] font-bold uppercase tracking-widest mono text-gray-500">Semaine '
  ),
  cn = P(
    '<div><div></div><div class=mt-1><span class="text-[11px] font-bold mono text-gray-600">h'
  ),
  an = P(
    '<div class="mb-2 sch-hist"><div class="flex items-end gap-1 h-10 relative"><div class="absolute left-0 right-0 border-t border-dashed border-gray-300"style=top:0></div></div><div class="flex gap-1 mt-0.5">'
  ),
  un = P(
    '<div class="sch-row grid-expert border-b border-gray-200 min-h-[120px]"><div class="sch-col-fix p-3 border-r border-gray-200 bg-white flex flex-col"><div class="flex items-center gap-1.5 mb-2"><div></div><span class="text-xs font-bold text-gray-900 uppercase tracking-tight"></span></div><div class="mt-auto space-y-1">'
  ),
  dn = P('<div class="flex-1 flex flex-col justify-end h-full"><div style=min-height:2px>'),
  fn = P('<div>h'),
  gn = P(
    '<div class="flex justify-between text-[10px] text-gray-400 mono"><span>:</span><span class="text-gray-600 font-bold">'
  ),
  hn = P('<div>'),
  mn = P('<span>'),
  bn = P(
    `<button type=button class="text-[9px] font-bold text-amber-700 hover:text-amber-900 uppercase tracking-wider"title="R\xE9initialiser l'override (date X3)"><span class="material-symbols-outlined text-[12px]">undo`
  ),
  pn = P('<div class="flex flex-wrap gap-1 mt-1">'),
  yn = P(
    '<div><div class="flex items-baseline justify-between gap-1.5"><span class="flex items-baseline gap-1 min-w-0"><span></span></span></div><p>'
  ),
  wn = P(
    '<span class="flex items-center gap-0.5 text-[9px] mono text-gray-500"><span class="material-symbols-outlined text-[10px] text-gray-400">'
  )
function Ye(e) {
  let { store: t } = e,
    [n, r] = V(null),
    [i, s] = V(null)
  return (
    Le(() => {
      let l = (c) => {
          let d = c.target
          d?.id === 'order-search' && t.onQueryInput(d.value)
        },
        o = (c) => {
          let d = c.target
          d?.id === 'order-search-scope' && t.onScopeChange(d.value)
        },
        a = (c) => {
          let d = c.target,
            p = d.closest('[data-type-filter]')
          if (p) {
            t.toggleType(p.getAttribute('data-type-filter'))
            return
          }
          let f = d.closest('[data-nature-filter]')
          f && t.toggleNature(f.getAttribute('data-nature-filter'))
        },
        u = (c) => {
          let d = document.getElementById('order-search')
          d &&
            ((c.metaKey || c.ctrlKey) && c.key.toLowerCase() === 'k'
              ? (c.preventDefault(), d.focus(), d.select())
              : c.key === 'Escape' &&
                document.activeElement === d &&
                ((d.value = ''), t.clearSearch(), d.blur()))
        }
      ;(document.addEventListener('input', l),
        document.addEventListener('change', o),
        document.addEventListener('click', a),
        window.addEventListener('keydown', u),
        de(() => {
          ;(document.removeEventListener('input', l),
            document.removeEventListener('change', o),
            document.removeEventListener('click', a),
            window.removeEventListener('keydown', u))
        }))
    }),
    ue(() => {
      let l = t.typeFilter()
      document.querySelectorAll('[data-type-filter]').forEach((o) => {
        o.classList.toggle('is-on', l.has(o.getAttribute('data-type-filter')))
      })
    }),
    ue(() => {
      let l = t.natureFilter()
      document.querySelectorAll('[data-nature-filter]').forEach((o) => {
        o.classList.toggle('is-on', l.has(o.getAttribute('data-nature-filter')))
      })
    }),
    (() => {
      var l = on(),
        o = l.firstChild,
        a = o.firstChild,
        u = a.firstChild,
        c = a.nextSibling,
        d = c.firstChild,
        p = o.nextSibling
      return (
        h(
          a,
          S(H, {
            get each() {
              return t.board.weekSpans
            },
            children: (f) =>
              (() => {
                var m = ln(),
                  b = m.firstChild,
                  x = b.firstChild
                return (
                  h(b, () => f.week, null),
                  L((M) => X(m, 'grid-column', `span ${f.span}`)),
                  m
                )
              })(),
          }),
          null
        ),
        h(
          c,
          S(H, {
            get each() {
              return t.board.days
            },
            children: (f, m) =>
              (() => {
                var b = cn(),
                  x = b.firstChild,
                  M = x.nextSibling,
                  O = M.firstChild,
                  j = O.firstChild
                return (
                  h(x, () => f.short),
                  h(O, () => Math.round(t.dayLoad()[m()] * 10) / 10, j),
                  L(
                    (E) => {
                      var K = `p-2 border-r border-gray-200 text-center ${f.headerTone}`,
                        J = `text-[10px] font-bold uppercase mono ${f.today ? 'text-primary' : 'text-gray-400'}`
                      return (K !== E.e && F(b, (E.e = K)), J !== E.t && F(x, (E.t = J)), E)
                    },
                    { e: void 0, t: void 0 }
                  ),
                  b
                )
              })(),
          }),
          null
        ),
        h(
          p,
          S(H, {
            get each() {
              return t.board.lines
            },
            children: (f) =>
              S(xn, {
                store: t,
                line: f,
                draggedId: n,
                setDraggedId: r,
                dropCol: i,
                setDropCol: s,
              }),
          })
        ),
        L((f) => X(l, '--cols', String(t.board.cols))),
        l
      )
    })()
  )
}
function xn(e) {
  let { store: t, line: n } = e
  return (() => {
    var r = un(),
      i = r.firstChild,
      s = i.firstChild,
      l = s.firstChild,
      o = l.nextSibling,
      a = s.nextSibling
    return (
      h(o, () => n.name),
      h(
        i,
        S(ee, {
          get when() {
            return t.lineWeekLoads(n.code).length > 0
          },
          get children() {
            var u = an(),
              c = u.firstChild,
              d = c.firstChild,
              p = c.nextSibling
            return (
              h(
                c,
                S(H, {
                  get each() {
                    return t.lineWeekLoads(n.code)
                  },
                  children: (f) =>
                    (() => {
                      var m = dn(),
                        b = m.firstChild
                      return (
                        L(
                          (x) => {
                            var M = `S${f.week} \u2014 ${f.hours}h (${f.pct}%)`,
                              O = `w-full rounded-sm ${f.barClass}`,
                              j = `${f.pct > 100 ? 100 : f.pct}%`
                            return (
                              M !== x.e && ne(m, 'title', (x.e = M)),
                              O !== x.t && F(b, (x.t = O)),
                              j !== x.a && X(b, 'height', (x.a = j)),
                              x
                            )
                          },
                          { e: void 0, t: void 0, a: void 0 }
                        ),
                        m
                      )
                    })(),
                }),
                null
              ),
              h(
                p,
                S(H, {
                  get each() {
                    return t.lineWeekLoads(n.code)
                  },
                  children: (f) =>
                    (() => {
                      var m = fn(),
                        b = m.firstChild
                      return (
                        h(m, () => f.hours, b),
                        L(() =>
                          F(
                            m,
                            `flex-1 text-center text-[8px] font-bold mono ${f.pct > 100 ? 'text-error' : 'text-gray-400'}`
                          )
                        ),
                        m
                      )
                    })(),
                })
              ),
              u
            )
          },
        }),
        a
      ),
      h(
        a,
        S(H, {
          get each() {
            return n.meta
          },
          children: (u) =>
            (() => {
              var c = gn(),
                d = c.firstChild,
                p = d.firstChild,
                f = d.nextSibling
              return (h(d, () => u.k, p), h(f, () => u.v), c)
            })(),
        })
      ),
      h(
        r,
        S(H, {
          get each() {
            return n.dayCells
          },
          children: (u, c) =>
            S(vn, {
              store: t,
              line: n,
              dc: u,
              get col() {
                return c()
              },
              get draggedId() {
                return e.draggedId
              },
              get setDraggedId() {
                return e.setDraggedId
              },
              get dropCol() {
                return e.dropCol
              },
              get setDropCol() {
                return e.setDropCol
              },
            }),
        }),
        null
      ),
      L(
        (u) => {
          var c = t.lineVisible(n.code) ? '' : 'none',
            d = `w-2 h-2 rounded-full ${n.dot}`
          return (c !== u.e && X(r, 'display', (u.e = c)), d !== u.t && F(l, (u.t = d)), u)
        },
        { e: void 0, t: void 0 }
      ),
      r
    )
  })()
}
function vn(e) {
  let { store: t, line: n, dc: r, col: i } = e,
    s = `${n.code}:${i}`
  return (() => {
    var l = hn()
    return (
      l.addEventListener('drop', (o) => {
        let a = e.draggedId()
        ;(e.setDropCol(null), a && (o.preventDefault(), t.moveCard(a, n.code, i, r.iso)))
      }),
      l.addEventListener('dragover', (o) => {
        e.draggedId() &&
          (o.preventDefault(),
          o.dataTransfer && (o.dataTransfer.dropEffect = 'move'),
          e.setDropCol(s))
      }),
      h(
        l,
        S(H, {
          get each() {
            return r.cards
          },
          children: (o) =>
            S(Cn, {
              store: t,
              card: o,
              line: n,
              get setDraggedId() {
                return e.setDraggedId
              },
              get setDropCol() {
                return e.setDropCol
              },
            }),
        })
      ),
      L(
        (o) => {
          var a = `sch-cal-cell p-1.5 border-r border-gray-200 flex flex-col gap-1.5 ${r.cellClass}`,
            u = e.dropCol() === s
          return (
            a !== o.e && F(l, (o.e = a)),
            u !== o.t && l.classList.toggle('is-drop', (o.t = u)),
            o
          )
        },
        { e: void 0, t: void 0 }
      ),
      l
    )
  })()
}
function Cn(e) {
  let { store: t, card: n } = e,
    r = () => t.cardMatches(n, e.line.code)
  return (() => {
    var i = yn(),
      s = i.firstChild,
      l = s.firstChild,
      o = l.firstChild,
      a = s.nextSibling
    return (
      i.addEventListener('dragend', () => {
        ;(e.setDraggedId(null), e.setDropCol(null))
      }),
      i.addEventListener('dragstart', (u) => {
        if (n.hasOverride) {
          u.preventDefault()
          return
        }
        ;(e.setDraggedId(n.id),
          u.dataTransfer &&
            ((u.dataTransfer.effectAllowed = 'move'), u.dataTransfer.setData('text/plain', n.id)))
      }),
      h(o, () => n.metric ?? n.id),
      h(
        l,
        S(ee, {
          get when() {
            return n.article
          },
          get children() {
            var u = mn()
            return (
              h(u, () => n.article),
              L(() => F(u, `mono text-[9px] ${n.fieldValTone} truncate`)),
              u
            )
          },
        }),
        null
      ),
      h(
        s,
        S(ee, {
          get when() {
            return n.hasOverride
          },
          get children() {
            var u = bn()
            return (
              (u.$$click = (c) => {
                ;(c.preventDefault(), c.stopPropagation(), t.resetOverride(n.id))
              }),
              u
            )
          },
        }),
        null
      ),
      h(a, () => n.title),
      h(
        i,
        S(ee, {
          get when() {
            return n.fields.length > 0
          },
          get children() {
            var u = pn()
            return (
              h(
                u,
                S(H, {
                  get each() {
                    return n.fields
                  },
                  children: (c) =>
                    (() => {
                      var d = wn(),
                        p = d.firstChild
                      return (h(p, () => c.icon), h(d, () => c.val, null), d)
                    })(),
                })
              ),
              u
            )
          },
        }),
        null
      ),
      L(
        (u) => {
          var c = r() && !n.hasOverride,
            d = n.id,
            p = `sch-of-card relative block bg-white border border-gray-200 rounded p-1.5 ${n.accentClass} ${n.cardClass}`,
            f = r() ? '' : '0.15',
            m = `mono text-[10px] font-bold ${n.idTone} truncate`,
            b = `text-[12px] font-semibold leading-tight truncate ${n.textTone}`
          return (
            c !== u.e && ne(i, 'draggable', (u.e = c)),
            d !== u.t && ne(i, 'data-order-id', (u.t = d)),
            p !== u.a && F(i, (u.a = p)),
            f !== u.o && X(i, 'opacity', (u.o = f)),
            m !== u.i && F(o, (u.i = m)),
            b !== u.n && F(a, (u.n = b)),
            u
          )
        },
        { e: void 0, t: void 0, a: void 0, o: void 0, i: void 0, n: void 0 }
      ),
      i
    )
  })()
}
dt(['click'])
var xt = '/api/v1/order-planning',
  Sn = ['MTS', 'MTO', 'NOR'],
  $n = ['COMMANDE', 'PREVISION']
function vt(e) {
  let [t, n] = Re(e),
    [r, i] = V(''),
    [s, l] = V('poste'),
    [o, a] = V(new Set(Sn)),
    [u, c] = V(new Set($n))
  function d(v) {
    let D = o(),
      C = v.orderType ?? 'NOR'
    return !(!D.has(C) || !u().has(v.nature))
  }
  function p(v, D) {
    if (!d(v)) return !1
    let C = r().trim().toLowerCase()
    if (!C) return !0
    switch (s()) {
      case 'poste':
        return D.toLowerCase().includes(C)
      case 'commande':
        return v.id.toLowerCase().includes(C)
      case 'article':
        return (v.article ?? '').toLowerCase().includes(C) || v.title.toLowerCase().includes(C)
      case 'client':
        return (v.customer ?? '').toLowerCase().includes(C)
    }
  }
  function f(v) {
    let D = t.lines.find((C) => C.code === v)
    return D ? D.dayCells.some((C) => C.cards.some((B) => p(B, v))) : !1
  }
  function m(v) {
    i(v)
  }
  function b(v) {
    l(v)
  }
  function x() {
    i('')
  }
  function M(v) {
    a((D) => {
      let C = new Set(D)
      return (C.has(v) ? C.delete(v) : C.add(v), C)
    })
  }
  function O(v) {
    c((D) => {
      let C = new Set(D)
      return (C.has(v) ? C.delete(v) : C.add(v), C)
    })
  }
  let j = ie(() => {
    let v = new Array(t.cols).fill(0)
    for (let D of t.lines)
      f(D.code) &&
        D.dayCells.forEach((C, B) => {
          for (let z of C.cards) p(z, D.code) && (v[B] += z.hours)
        })
    return v
  })
  function E(v) {
    let D = t.lines.find((B) => B.code === v)
    if (!D) return []
    let C = {}
    return (
      D.dayCells.forEach((B, z) => {
        let y = t.colWeek[z]
        if (y !== void 0) for (let _ of B.cards) C[y] = (C[y] ?? 0) + _.hours
      }),
      D.weekLoads.map((B) => {
        let z = Math.round((C[B.week] ?? 0) * 10) / 10,
          y = t.weekCaps[String(B.week)] ?? 0,
          _ = y > 0 ? Math.round((z / y) * 100) : 0,
          $ = _ > 100 ? 'bg-error' : _ >= 90 ? 'bg-blue-500' : 'bg-emerald-500'
        return { week: B.week, hours: z, pct: _, barClass: $ }
      })
    )
  }
  function K(v, D, C, B) {
    let [z, y] = v.split('#')
    if (!z || !y) return
    let $ = (() => {
      for (let w = 0; w < t.lines.length; w++) {
        let G = t.lines[w].dayCells
        for (let Y = 0; Y < G.length; Y++) {
          let q = G[Y].cards.findIndex((se) => se.id === v)
          if (q !== -1) return { line: w, col: Y, idx: q, card: G[Y].cards[q] }
        }
      }
      return null
    })()
    if (!$) return
    if (t.lines[$.line].code !== D) {
      le('Poste fig\xE9 par la gamme \u2014 d\xE9placez seulement le jour.')
      return
    }
    if ($.col === C) return
    let A = t.lines.findIndex((w) => w.code === D)
    if (A === -1) return
    let R = { line: $.line, col: $.col, idx: $.idx },
      I = $.card
    ;(n(
      ye((w) => {
        ;(w.lines[R.line].dayCells[R.col].cards.splice(R.idx, 1),
          w.lines[A].dayCells[C].cards.push({
            ...I,
            hasOverride: !0,
            accentClass: 'border-l-amber-500',
            cardClass: 'bg-amber-50/40',
            idTone: 'text-amber-700',
          }))
      })
    ),
      fetch(`${xt}/order-lines/${encodeURIComponent(z)}/${encodeURIComponent(y)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateLivraison: B }),
      })
        .then((w) => {
          if (!w.ok) throw new Error(`HTTP ${w.status}`)
        })
        .catch((w) => {
          ;(n(
            ye((G) => {
              let Y = G.lines[A].dayCells[C].cards.findIndex((q) => q.id === v)
              ;(Y !== -1 && G.lines[A].dayCells[C].cards.splice(Y, 1),
                G.lines[R.line].dayCells[R.col].cards.splice(R.idx, 0, I))
            })
          ),
            window.dispatchEvent(
              new CustomEvent('sch-toast', { detail: `D\xE9placement \xE9chou\xE9 : ${w.message}` })
            ))
        }))
  }
  function J(v) {
    let [D, C] = v.split('#')
    !D ||
      !C ||
      fetch(`${xt}/order-lines/${encodeURIComponent(D)}/${encodeURIComponent(C)}/override`, {
        method: 'DELETE',
      })
        .then((B) => {
          if (!B.ok) throw new Error(`HTTP ${B.status}`)
          ;(le('Override r\xE9initialis\xE9'), window.location.reload())
        })
        .catch((B) => le(`\xC9chec : ${B.message}`))
  }
  function le(v) {
    window.dispatchEvent(new CustomEvent('sch-toast', { detail: v }))
  }
  return {
    board: t,
    query: r,
    scope: s,
    typeFilter: o,
    natureFilter: u,
    cardMatches: p,
    lineVisible: f,
    dayLoad: j,
    lineWeekLoads: E,
    onQueryInput: m,
    onScopeChange: b,
    clearSearch: x,
    toggleType: M,
    toggleNature: O,
    moveCard: K,
    resetOverride: J,
  }
}
var kn = {
  'board-grid': (e) => {
    let t = document.getElementById('board-data')
    if (!t?.textContent) return (console.warn('[solid] #board-data introuvable'), () => {})
    let n = JSON.parse(t.textContent),
      r = wt(n)
    return Ue(() => S(We, { store: r }), e)
  },
  'order-grid': (e) => {
    let t = document.getElementById('order-board-data')
    if (!t?.textContent) return (console.warn('[solid] #order-board-data introuvable'), () => {})
    let n = JSON.parse(t.textContent),
      r = vt(n)
    return Ue(() => S(Ye, { store: r }), e)
  },
}
function Ct(e) {
  let t = e.dataset.solid
  if (!t) return
  let n = kn[t]
  if (!n) {
    console.warn(`[solid] \xEElot inconnu: "${t}"`)
    return
  }
  return n(e)
}
window.up
  ? window.up.compiler('[data-solid]', (e) => Ct(e))
  : document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-solid]').forEach(Ct)
    })
