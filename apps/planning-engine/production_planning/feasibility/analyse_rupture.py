"""Analyse de rupture - Remontee d'impact composant.

Remonte l'arbre BOM (nomenclature) depuis un composant en rupture
vers tous les parents, calcule un pool de stock multi-niveaux
(composant + SF + PF), puis simule un waterfall chronologique
des commandes clients pour identifier le moment precis de la rupture.

Pool (bottom-up):
    stock_physique a chaque niveau de la nomenclature × ratio_cumule.
    Options pour inclure/exclure les niveaux SF et PF.

Waterfall (top-down):
    Pour chaque commande, on verifie d'abord si le stock physique
    de l'article commande couvre la demande, puis les allocations
    existantes. Seul le reste non couvert consomme le pool.
"""

from __future__ import annotations

from collections import defaultdict, deque

from ..availability import AvailabilityKernel
from ..domain_rules import is_firm_of_status
from ..loaders import DataLoader
from ..orders.matching import CommandeOFMatcher
from .analyse_rupture_models import (
    AnalyseRuptureResult,
    AnalyseRuptureSummary,
    BlockedOF,
    CommandeBloquee,
    ComponentInfo,
    PoolContrib,
)

_MAX_DEPTH = 10
_MAX_NODES = 10_000


class AnalyseRuptureService:
    """Service d'analyse de rupture composant.

    Construit un index inverse (composant -> parents) a partir
    de la nomenclature, puis effectue un BFS vers le haut pour
    identifier toutes les commandes bloquees et OFs impactes.

    Le pool multi-niveaux somme les stocks physiques a chaque
    niveau de la nomenclature (composant + SF + PF) multiplies
    par le ratio cumule.

    Le waterfall simule la consommation chronologique:
    pour chaque commande, on consomme d'abord le stock physique
    de l'article, puis les allocations, puis le pool.
    """

    def __init__(self, loader: DataLoader) -> None:
        self._loader = loader
        self._availability = AvailabilityKernel(loader)
        self._reverse_index = self._build_reverse_index()
        self._of_index = self._build_of_index()
        self._besoins_by_article = self._build_besoins_index()

    # ── Index construction ──────────────────────────────────────

    def _build_reverse_index(self) -> dict[str, list]:
        """Index composant -> liste de NomenclatureEntry parents."""
        index: dict[str, list] = defaultdict(list)
        seen: dict[str, set[str]] = defaultdict(set)

        for nomenclature in self._loader.nomenclatures.values():
            for entry in nomenclature.composants:
                key = entry.article_composant
                pair = (key, entry.article_parent)
                if pair not in seen[key]:
                    seen[key].add(entry.article_parent)
                    index[key].append(entry)

        return dict(index)

    def _build_of_index(self) -> dict[str, list]:
        """Index article -> OFs actifs (qte_restante > 0)."""
        idx: dict[str, list] = defaultdict(list)
        for of in self._loader.ofs:
            if of.qte_restante > 0:
                idx[of.article].append(of)
        return dict(idx)

    def _build_besoins_index(self) -> dict[str, list]:
        """Index article -> BesoinClient entries."""
        idx: dict[str, list] = defaultdict(list)
        for besoin in self._loader.commandes_clients:
            idx[besoin.article].append(besoin)
        return dict(idx)

    # ── Main entry point ────────────────────────────────────────

    def analyze(
        self,
        component_code: str,
        include_previsions: bool = False,
        include_receptions: bool = False,
        use_pool: bool = True,
        merge_branches: bool = True,
        include_sf: bool = True,
        include_pf: bool = False,
    ) -> AnalyseRuptureResult:
        """Analyse l'impact d'une rupture sur le composant donne."""
        article = self._loader.get_article(component_code)
        if article is None:
            raise ValueError(f"Composant non trouve: {component_code}")

        stock = self._loader.get_stock(component_code)
        stock_physique = stock.stock_physique if stock else 0
        stock_alloue = stock.stock_alloue if stock else 0
        stock_disponible = self._availability.available_without_receptions(component_code)

        # Stock projete = stock disponible + receptions prevues
        receptions = self._loader.get_receptions(component_code)
        stock_disponible_projete = stock_disponible
        if include_receptions:
            stock_disponible_projete += self._availability.total_receptions(component_code)

        # BFS avec ratios cumules
        paths, article_ratios, nodes_visited, truncated = self._bfs_upward(component_code)
        article_paths = self._build_article_paths(paths)

        # Collecte globale des OFs bloques (faite une seule fois)
        all_blocked_ofs, ofs_by_article = self._collect_blocked_ofs(
            article_paths, component_code,
        )

        if merge_branches:
            # ── Mode fusion: un seul pool, un seul waterfall ──
            pool_total, pool_repartition = self._compute_pool_or_stock(
                component_code, article_ratios, article_paths,
                article, stock_physique, use_pool,
                include_sf=include_sf, include_pf=include_pf,
            )

            waterfall_data = self._compute_waterfall(
                article_ratios, article_paths, pool_total, receptions,
                include_previsions, include_receptions,
            )

            of_linking, matching_methods = self._match_besoins_to_ofs(
                article_paths, ofs_by_article,
                include_previsions=include_previsions,
            )

            all_commandes_bloquees = self._build_commandes_bloquees(
                waterfall_data, of_linking, matching_methods,
            )
        else:
            # ── Mode split: un pool + waterfall par branche (feuille PF/SF) ──
            branch_map = self._build_branch_article_map(paths, component_code)

            # Pool global (affiche dans le header)
            pool_total, pool_repartition = self._compute_pool_or_stock(
                component_code, article_ratios, article_paths,
                article, stock_physique, use_pool,
                include_sf=include_sf, include_pf=include_pf,
            )

            all_commandes_bloquees = []
            of_linking_global: dict[tuple, list[BlockedOF]] = {}
            matching_methods_global: dict[tuple, str] = {}

            for leaf, branch_articles in branch_map.items():
                # Filtrer article_ratios et article_paths pour cette branche
                branch_ratios = {
                    a: r for a, r in article_ratios.items()
                    if a in branch_articles
                }
                branch_paths = {
                    a: p for a, p in article_paths.items()
                    if a in branch_articles
                }

                # Pool de branche: le stock composant est compte virtuellement dans chaque branche
                branch_pool_total, _ = self._compute_pool_or_stock(
                    component_code, branch_ratios, branch_paths,
                    article, stock_physique, use_pool,
                    include_sf=include_sf, include_pf=include_pf,
                )

                # Waterfall propre a cette branche
                branch_waterfall = self._compute_waterfall(
                    branch_ratios, branch_paths, branch_pool_total, receptions,
                    include_previsions, include_receptions,
                )

                # OF linking pour cette branche
                branch_of_linking, branch_methods = self._match_besoins_to_ofs(
                    branch_paths, ofs_by_article,
                    include_previsions=include_previsions,
                )

                branch_cmds = self._build_commandes_bloquees(
                    branch_waterfall, branch_of_linking, branch_methods,
                )

                # Tag branch_key + branch_pool_total sur chaque commande de cette branche
                for cmd in branch_cmds:
                    cmd.branch_key = leaf
                    cmd.branch_pool_total = branch_pool_total

                all_commandes_bloquees.extend(branch_cmds)
                of_linking_global.update(branch_of_linking)
                matching_methods_global.update(branch_methods)

            # Dedupliquer les commandes (meme num_commande peut apparaître dans plusieurs branches)
            seen_cmds: set[str] = set()
            unique_cmds: list[CommandeBloquee] = []
            for cmd in all_commandes_bloquees:
                cmd_key = f"{cmd.num_commande}|{cmd.article}|{cmd.branch_key}"
                if cmd_key not in seen_cmds:
                    seen_cmds.add(cmd_key)
                    unique_cmds.append(cmd)
            all_commandes_bloquees = unique_cmds
            of_linking = of_linking_global
            matching_methods = matching_methods_global

        # OFs sans rattachement commande direct
        ofs_with_orders: set[str] = set()
        for ofs in of_linking.values():
            for of in ofs:
                ofs_with_orders.add(of.num_of)

        ofs_sans_commande = [
            of for of in all_blocked_ofs
            if of.num_of not in ofs_with_orders
        ]

        # Calcul du deficit (exclut les OFs dont les composants sont deja alloues)
        total_qte_requise = sum(
            of.qte_restante for of in all_blocked_ofs
            if not of.composants_alloues
        )
        deficit = max(0, total_qte_requise - stock_disponible)
        deficit_projete = max(0, total_qte_requise - stock_disponible_projete)

        # Lignes de production impactees
        affected_lines = sorted({
            poste
            for of in all_blocked_ofs
            for poste in of.postes_charge
        })

        if not merge_branches:
            # Split mode: group by branch first, then sort by date within each branch
            all_commandes_bloquees.sort(key=lambda c: (c.branch_key or "", c.date_expedition))
        else:
            all_commandes_bloquees.sort(key=lambda c: c.date_expedition)
        ofs_sans_commande.sort(key=lambda o: o.date_fin)

        max_depth = max(
            (len(p) for p in article_paths.values()),
            default=0,
        )

        return AnalyseRuptureResult(
            component=ComponentInfo(
                code=component_code,
                description=article.description,
                stock_physique=stock_physique,
                stock_alloue=stock_alloue,
                stock_disponible=stock_disponible,
                stock_disponible_projete=stock_disponible_projete,
                deficit=deficit,
                deficit_projete=deficit_projete,
                pool_total=pool_total,
                pool_repartition=pool_repartition,
            ),
            commandes_bloquees=all_commandes_bloquees,
            ofs_sans_commande=ofs_sans_commande,
            summary=AnalyseRuptureSummary(
                total_blocked_ofs=len(all_blocked_ofs),
                total_affected_orders=len(all_commandes_bloquees),
                affected_lines=affected_lines,
                max_bom_depth=max_depth,
                total_nodes_visited=nodes_visited,
                truncated=truncated,
            ),
            include_previsions=include_previsions,
            include_receptions=include_receptions,
            use_pool=use_pool,
            merge_branches=merge_branches,
            include_sf=include_sf,
            include_pf=include_pf,
        )

    # ── BFS algorithm (with ratios) ────────────────────────────

    def _bfs_upward(
        self, component_code: str,
    ) -> tuple[list[list[str]], dict[str, float], int, bool]:
        """BFS inverse avec calcul du ratio cumule.

        Returns
        -------
        tuple
            (chemins, article -> ratio_cumule, noeuds visites, tronque?)
        """
        queue: deque[tuple[str, list[str], float]] = deque()
        queue.append((component_code, [component_code], 1.0))

        visited: set[str] = {component_code}
        paths: list[list[str]] = []
        article_ratios: dict[str, float] = {component_code: 1.0}
        nodes_visited = 0
        truncated = False

        while queue:
            if nodes_visited >= _MAX_NODES:
                truncated = True
                break

            current, path, ratio = queue.popleft()
            nodes_visited += 1

            parents = self._reverse_index.get(current, [])

            if not parents:
                if len(path) > 1:
                    paths.append(path)
                continue

            for entry in parents:
                parent_code = entry.article_parent
                parent_ratio = ratio * entry.qte_lien

                if len(path) >= _MAX_DEPTH:
                    paths.append(path)
                    truncated = True
                    continue

                new_path = path + [parent_code]

                if parent_code in visited:
                    paths.append(new_path)
                    if parent_code not in article_ratios or parent_ratio > article_ratios[parent_code]:
                        article_ratios[parent_code] = parent_ratio
                    continue

                visited.add(parent_code)
                article_ratios[parent_code] = parent_ratio
                queue.append((parent_code, new_path, parent_ratio))

        return paths, article_ratios, nodes_visited, truncated

    # ── Path helpers ────────────────────────────────────────────

    def _compute_pool_or_stock(
        self,
        component_code: str,
        article_ratios: dict[str, float],
        article_paths: dict[str, list[str]],
        article,
        stock_physique: float,
        use_pool: bool,
        *,
        include_sf: bool = True,
        include_pf: bool = False,
    ) -> tuple[float, list[PoolContrib]]:
        """Compute pool or fall back to simple stock."""
        if use_pool:
            return self._compute_pool(
                component_code, article_ratios, article_paths,
                include_sf=include_sf, include_pf=include_pf,
            )
        return float(stock_physique), [PoolContrib(
            article=component_code,
            description=article.description,
            categorie="COMPOSANT",
            stock_utilise=stock_physique,
            ratio_cumule=1.0,
            contribution=float(stock_physique),
        )]

    @staticmethod
    def _build_article_paths(paths: list[list[str]]) -> dict[str, list[str]]:
        """Map chaque article impacte vers son chemin le plus court."""
        article_paths: dict[str, list[str]] = {}
        for path in paths:
            for i in range(1, len(path)):
                article = path[i]
                sub_path = path[: i + 1]
                if article not in article_paths or len(sub_path) < len(article_paths[article]):
                    article_paths[article] = sub_path
        return article_paths

    @staticmethod
    def _build_branch_article_map(
        paths: list[list[str]], component_code: str,
    ) -> dict[str, set[str]]:
        """Map chaque SF (premier niveau apres le composant) vers ses articles.

        Contrairement a un groupement par feuille PF, ce groupement evite
        de compter le stock SF plusieurs fois quand plusieurs PFs partagent
        le meme SF.
        """
        branch_map: dict[str, set[str]] = {}
        for path in paths:
            # Trouver le SF: premier article apres le composant
            sf = None
            for i, article in enumerate(path):
                if i > 0 and article != component_code:
                    sf = article
                    break
            if sf is None:
                # Path ne contient que le composant, ignorer
                continue
            if sf not in branch_map:
                branch_map[sf] = set()
            branch_map[sf].update(path)
        return branch_map

    # ── Multi-level pool ────────────────────────────────────────

    def _compute_pool(
        self,
        component_code: str,
        article_ratios: dict[str, float],
        article_paths: dict[str, list[str]],
        *,
        include_sf: bool = True,
        include_pf: bool = False,
    ) -> tuple[float, list[PoolContrib]]:
        """Calcule le pool de stock multi-niveaux.

        Pour chaque article dans l'arbre BOM:
        - Composant: stock_physique (toujours inclus)
        - SF (categorie debutant par "SF"): stock_physique × ratio (si include_sf)
        - PF (categorie debutant par "PF"): stock_physique × ratio (si include_pf)
        """
        repartition: list[PoolContrib] = []
        pool_total = 0.0

        for article_code, ratio in article_ratios.items():
            art = self._loader.get_article(article_code)
            if art is None:
                continue

            stk = self._loader.get_stock(article_code)
            stock_phys = stk.stock_physique if stk else 0

            if article_code == component_code:
                # Composant lui-meme: toujours inclus
                contrib = float(stock_phys) * ratio
                cat_label = "COMPOSANT"
            elif art.categorie.startswith("SF") or art.categorie == "STF":
                # SF: inclus seulement si include_sf
                if not include_sf:
                    continue
                contrib = float(stock_phys) * ratio
                cat_label = "SF"
            elif art.categorie.startswith("PF"):
                # PF: inclus seulement si include_pf
                if not include_pf:
                    continue
                contrib = float(stock_phys) * ratio
                cat_label = "PF"
            else:
                # Autres categories (APV, etc.): traites comme SF si include_sf
                if not include_sf:
                    continue
                contrib = float(stock_phys) * ratio
                cat_label = "SF"

            pool_total += contrib

            # Derive parent from BOM path: parent is the previous element
            parent = None
            path = article_paths.get(article_code, [])
            if len(path) >= 2 and path[-2] in article_ratios:
                parent = path[-2]

            repartition.append(PoolContrib(
                article=article_code,
                description=art.description,
                categorie=cat_label,
                stock_utilise=stock_phys,
                ratio_cumule=ratio,
                contribution=contrib,
                parent_article=parent,
            ))

        # Trier: composant d'abord, puis par contribution decroissante
        repartition.sort(key=lambda p: (0 if p.categorie == "COMPOSANT" else 1, -p.contribution))
        return pool_total, repartition

    # ── Waterfall ────────────────────────────────────────────────

    def _compute_waterfall(
        self,
        article_ratios: dict[str, float],
        article_paths: dict[str, list[str]],
        pool_total: float,
        receptions: list,
        include_previsions: bool,
        include_receptions: bool,
    ) -> dict[tuple[str, str, str, str], dict]:
        """Simule la consommation chronologique du pool par les commandes.

        Pour chaque besoin:
        1. Verifie si le stock physique de l'article peut couvrir la demande
        2. Verifie les allocations existantes (qte_allouee)
        3. Seul le reste non couvert consomme le pool (× ratio_cumule)

        Returns
        -------
        dict
            Commandes keyed by (num_commande, client, article, date)
            avec qte_impact_composant, proj_pool, etat.
        """
        # Collecter tous les besoins pour les articles impactes
        besoins: list[tuple] = []  # (besoin, ratio)
        for article_code, ratio in article_ratios.items():
            if article_code not in self._besoins_by_article:
                continue
            for besoin in self._besoins_by_article[article_code]:
                if besoin.qte_restante <= 0:
                    continue
                if not include_previsions and not besoin.est_commande():
                    continue
                besoins.append((besoin, ratio))

        # Trier par date d'expedition
        besoins.sort(key=lambda b: b[0].date_expedition_demandee)

        # Suivi du stock physique restant par article (consomme par les commandes)
        remaining_stock: dict[str, float] = {}
        for article_code in article_ratios:
            stk = self._loader.get_stock(article_code)
            remaining_stock[article_code] = float(stk.stock_physique) if stk else 0.0

        # Calcul cumulatif
        cumul_impact = 0.0
        commandes: dict[tuple[str, str, str, str], dict] = {}

        # Pre-calculer les receptions triees par date
        sorted_receptions = sorted(receptions, key=lambda r: r.date_reception_prevue)

        for besoin, ratio in besoins:
            # Etape 1: deduire les allocations deja faites
            unallocated = max(0, besoin.qte_restante - besoin.qte_allouee)

            # Etape 2: consommer le stock physique de l'article commande
            article = besoin.article
            stock_avail = remaining_stock.get(article, 0.0)
            from_stock = min(unallocated, stock_avail)
            remaining_stock[article] = stock_avail - from_stock

            # Etape 3: le reste consomme le pool
            still_uncovered = unallocated - from_stock
            qte_impact = still_uncovered * ratio
            cumul_impact += qte_impact

            # Receptions cumulees jusqu'a cette date
            cumul_receipts = 0
            if include_receptions:
                for rec in sorted_receptions:
                    if rec.date_reception_prevue <= besoin.date_expedition_demandee:
                        cumul_receipts += rec.quantite_restante
                    else:
                        break

            proj_pool = pool_total + cumul_receipts - cumul_impact
            etat = "RUPTURE" if proj_pool < 0 else "OK"

            key = (besoin.num_commande, besoin.nom_client, besoin.article, besoin.date_expedition_demandee.isoformat())
            if key not in commandes:
                chemin = list(article_paths.get(besoin.article, []))
                commandes[key] = {
                    "num_commande": besoin.num_commande,
                    "client": besoin.nom_client,
                    "article": besoin.article,
                    "qte_restante": besoin.qte_restante,
                    "date_expedition": besoin.date_expedition_demandee.isoformat(),
                    "nature": besoin.nature_besoin.value,
                    "type_commande": besoin.type_commande.value,
                    "chemin": chemin,
                    "qte_impact_composant": 0.0,
                    "proj_pool": proj_pool,
                    "etat": etat,
                }
            # Sommer les impacts si plusieurs besoins pour la meme commande
            commandes[key]["qte_impact_composant"] += qte_impact
            commandes[key]["proj_pool"] = proj_pool
            commandes[key]["etat"] = etat

        return commandes

    # ── OF collection ───────────────────────────────────────────

    def _collect_blocked_ofs(
        self,
        article_paths: dict[str, list[str]],
        component_code: str = "",
    ) -> tuple[list[BlockedOF], dict[str, list[BlockedOF]]]:
        """Collecte les OFs bloques pour chaque article impacte."""
        all_blocked: list[BlockedOF] = []
        by_article: dict[str, list[BlockedOF]] = {}
        seen: set[str] = set()

        # Pre-compute allocated OFs for the component (Ferme = composants alloues)
        allocated_ofs = self._get_allocated_ofs(component_code)

        for article_code in article_paths:
            for of in self._of_index.get(article_code, []):
                if of.num_of in seen:
                    continue
                seen.add(of.num_of)

                postes = self._resolve_postes(of.article)
                is_allocated = of.num_of in allocated_ofs
                blocked = BlockedOF(
                    num_of=of.num_of,
                    article=of.article,
                    qte_a_fabriquer=of.qte_a_fabriquer,
                    qte_restante=of.qte_restante,
                    date_fin=of.date_fin.isoformat(),
                    statut=of.statut_texte,
                    postes_charge=postes,
                    composants_alloues=is_allocated,
                )
                all_blocked.append(blocked)
                by_article.setdefault(article_code, []).append(blocked)

        return all_blocked, by_article

    # ── Order-centric OF linking via CommandeOFMatcher ──────────

    def _match_besoins_to_ofs(
        self,
        article_paths: dict[str, list[str]],
        ofs_by_article: dict[str, list[BlockedOF]],
        *,
        include_previsions: bool = False,
    ) -> tuple[dict[tuple, list[BlockedOF]], dict[tuple, str]]:
        """Lie les commandes clients aux OFs bloques via CommandeOFMatcher."""
        matcher = CommandeOFMatcher(self._loader)
        result: dict[tuple[str, str, str, str], list[BlockedOF]] = defaultdict(list)
        methods: dict[tuple[str, str, str, str], str] = {}

        for article_code in article_paths:
            besoins = self._besoins_by_article.get(article_code, [])
            if not besoins:
                continue

            filtered = [
                b for b in besoins
                if b.qte_restante > 0 and (include_previsions or b.est_commande())
            ]
            if not filtered:
                continue

            matches = matcher.match_commandes(filtered)

            for match in matches:
                besoin = match.commande
                key = (
                    besoin.num_commande,
                    besoin.nom_client,
                    besoin.article,
                    besoin.date_expedition_demandee.isoformat(),
                )
                methods[key] = match.matching_method
                for allocation in match.of_allocations:
                    blocked_of = next(
                        (of for of in ofs_by_article.get(article_code, [])
                         if of.num_of == allocation.of.num_of),
                        None,
                    )
                    if blocked_of is not None and blocked_of not in result[key]:
                        result[key].append(blocked_of)

        return dict(result), methods

    # ── Build commandes with waterfall + OFs ────────────────────

    @staticmethod
    def _build_commandes_bloquees(
        waterfall_data: dict[tuple, dict],
        of_linking: dict[tuple, list[BlockedOF]],
        matching_methods: dict[tuple, str] | None = None,
    ) -> list[CommandeBloquee]:
        """Construit les CommandeBloquee avec waterfall et OFs."""
        result = []
        for key, data in waterfall_data.items():
            ofs = of_linking.get(key, [])
            method = (matching_methods or {}).get(key, "")

            result.append(CommandeBloquee(
                num_commande=data["num_commande"],
                client=data["client"],
                article=data["article"],
                qte_restante=data["qte_restante"],
                date_expedition=data["date_expedition"],
                nature=data["nature"],
                type_commande=data["type_commande"],
                chemin_impact=data["chemin"],
                ofs_bloquants=ofs,
                qte_impact_composant=data["qte_impact_composant"],
                proj_pool=data["proj_pool"],
                etat=data["etat"],
                matching_method=method,
            ))
        return result

    # ── Helpers ─────────────────────────────────────────────────

    def _resolve_postes(self, article: str) -> list[str]:
        """Resout les postes de charge d'un article via sa Gamme."""
        gamme = self._loader.get_gamme(article)
        if gamme is None:
            return []
        return [op.poste_charge for op in gamme.operations]

    def _get_allocated_ofs(self, component_code: str) -> set[str]:
        """Identifie les OFs dont les composants sont deja alloues."""
        allocated: set[str] = set()
        if not component_code:
            return allocated

        allocations = getattr(self._loader, "allocations", None)
        if not allocations:
            return allocated

        # Construire un index: num_doc -> qte allouee du composant
        alloc_by_doc: dict[str, float] = {}
        for num_doc, allocs in allocations.items():
            for alloc in allocs:
                if alloc.article == component_code and alloc.qte_allouee > 0:
                    alloc_by_doc[num_doc] = alloc_by_doc.get(num_doc, 0) + alloc.qte_allouee

        # Verifier quels OFs Fermes ont ce composant alloue
        for of in self._loader.ofs:
            if is_firm_of_status(of.statut_num) and of.qte_restante > 0:
                if alloc_by_doc.get(of.num_of, 0) > 0:
                    allocated.add(of.num_of)

        return allocated
