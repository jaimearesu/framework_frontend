// js/core/dna.js
// ---------------------------------------------------------------------
// DIE SYNTAX-DNA PRÜFEN – noch bevor sie ans Backend geht
//
// Die DNA (Code-Art "syntax") beschreibt, woraus ein Objekt besteht:
//
//   {
//     "type": "instance",          // oder "iteration"
//     "identifier": "shop",        // Name des Knotens (Teil der Adresse)
//     "domain": "shop",            // zu welcher Familie der Knoten gehört
//     "source": ["0"],             // Pfad des Objekts, das hier eingesetzt wird
//     "children": [ { …Kind… } ]   // Kinder (verweisen auf andere Objekte)
//   }
//
// Das Backend (syntaxValidator.js) prüft dasselbe und ergänzt Fehlendes:
//   - fehlender type       -> "instance"
//   - fehlender identifier -> Zufalls-ID
//   - fehlende source      -> [0]
//   - fehlende domain      -> FEHLER
//   - unbekannte domain    -> FEHLER ("Injection abgebrochen")
// Hier zeigen wir das schon beim Tippen an – als reine Funktion (getestet).
// ---------------------------------------------------------------------

const TYPES = ['instance', 'iteration'];

// JSON-Fehlermeldung verständlich machen und die Zeile finden
const describeParseError = (text, err) => {
    const m = /position (\d+)/i.exec(err.message);
    if (!m) return { message: `Kein gültiges JSON: ${err.message}`, line: null };
    const pos = Number(m[1]);
    const line = text.slice(0, pos).split('\n').length;
    return { message: `Kein gültiges JSON (Zeile ${line}): ${err.message}`, line };
};

// Ergebnis:
// {
//   ok:        true, wenn das Backend die DNA annehmen sollte
//   value:     die gelesene DNA (oder null)
//   errors:    [ '…' ]  -> würde das Backend ablehnen
//   warnings:  [ '…' ]  -> geht, ist aber vermutlich nicht gewollt
//   notes:     [ '…' ]  -> das Backend ergänzt etwas automatisch
//   stats:     { nodes, depth }
// }
export const analyzeDna = (input, { knownDomains = null } = {}) => {
    const result = {
        ok: false,
        value: null,
        errors: [],
        warnings: [],
        notes: [],
        stats: { nodes: 0, depth: 0 },
        line: null
    };

    let value = input;
    if (typeof input === 'string') {
        if (!input.trim()) {
            result.errors.push('Die DNA ist leer.');
            return result;
        }
        try {
            value = JSON.parse(input);
        } catch (err) {
            const parsed = describeParseError(input, err);
            result.errors.push(parsed.message);
            result.line = parsed.line;
            return result;
        }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        result.errors.push('Die DNA muss ein Objekt { … } sein (kein Array, kein Text).');
        return result;
    }
    result.value = value;
    const known = knownDomains ? new Set(knownDomains) : null;

    const visit = (node, where, depth) => {
        result.stats.nodes++;
        result.stats.depth = Math.max(result.stats.depth, depth);
        const name = node?.identifier ? `„${node.identifier}“` : where;

        if (!node || typeof node !== 'object' || Array.isArray(node)) {
            result.errors.push(`${where}: muss ein Objekt { … } sein.`);
            return;
        }
        if (node.type === undefined) result.notes.push(`${name}: kein type – das Backend setzt "instance".`);
        else if (!TYPES.includes(node.type))
            result.errors.push(`${name}: type "${node.type}" ist ungültig (erlaubt: instance, iteration).`);

        if (node.identifier === undefined || String(node.identifier).trim() === '')
            result.notes.push(`${where}: kein identifier – das Backend vergibt eine Zufalls-ID.`);

        if (!node.domain) result.errors.push(`${name}: domain fehlt.`);
        else if (known && !known.has(node.domain))
            result.warnings.push(
                `${name}: Domain "${node.domain}" kennst du nicht (gibt es sie? Sonst lehnt das Backend ab).`
            );

        if (!Array.isArray(node.source) || node.source.length === 0)
            result.notes.push(`${name}: keine source – das Backend setzt [0].`);

        if (node.children !== undefined) {
            if (!Array.isArray(node.children)) {
                result.warnings.push(`${name}: children ist keine Liste – das Backend entfernt es.`);
            } else {
                const seen = new Set();
                node.children.forEach((child, i) => {
                    const id = child?.identifier;
                    if (id !== undefined && seen.has(id))
                        result.warnings.push(
                            `${name}: zwei Kinder heissen „${id}“ – über die Adresse ist nur das erste erreichbar.`
                        );
                    if (id !== undefined) seen.add(id);
                    visit(child, `${name} → Kind ${i + 1}`, depth + 1);
                });
            }
        }
    };

    visit(value, 'Wurzel', 1);
    result.ok = result.errors.length === 0;
    return result;
};

// Ein Kind in die DNA einfügen (gibt eine NEUE DNA zurück, die alte bleibt unverändert).
// Gibt es schon ein Kind mit derselben source, wird nichts doppelt eingetragen.
export const addChildToDna = (dna, childRef) => {
    const copy = JSON.parse(JSON.stringify(dna || {}));
    const children = Array.isArray(copy.children) ? copy.children : [];
    const same = c => JSON.stringify(c?.source) === JSON.stringify(childRef.source) && c?.domain === childRef.domain;
    if (!children.some(same)) children.push(childRef);
    copy.children = children;
    return copy;
};
