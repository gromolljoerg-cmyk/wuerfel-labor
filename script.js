let meinChart = null;
let globaleStatistik = {}; 
let schuelerVorhersage = []; // Speichert die von den Schülern geschätzten Werte (Zahlen oder null)
let gesamtWuerfeZaehler = 0; 
let aktuellerModus = 'einzel'; 
let simulationsInterval = null; 
let simulationGestartet = false; // Trackt, ob die Simulation im Massenmodus aktiv läuft oder lief

// Hilfsvariable: Welcher Index (bzw. welche Augensumme) wird als nächstes durch Klick geschätzt?
let naechsterSchaetzIndex = 0; 

// Trackt, bei welchem Wurf-Zählerstand ein Balken das letzte Mal aktiv erhöht wurde
let letztesUpdateProBalken = {}; 

// Ein Array, das alle einzelnen Zeilen für den Excel/CODAP-Export dynamisch mitspeichert
let rohdatenProtokoll = []; 

// Zeitstempel für den Simulationsstart
let simulationsStartZeitpunkt = null;

function wuerfleEinmal(seiten) {
    return Math.floor(Math.random() * seiten) + 1;
}

// Berechnet per Kombinationen-Faltung exakt, auf wie viele Arten eine Augensumme gewürfelt werden kann
function berechneKombinationenFuerSumme(anzahlWuerfel, seiten, zielSumme) {
    let kombis = new Array(anzahlWuerfel * seiten + 1).fill(0);
    
    for (let s = 1; s <= seiten; s++) {
        kombis[s] = 1;
    }
    
    for (let w = 2; w <= anzahlWuerfel; w++) {
        let temporaer = new Array(anzahlWuerfel * seiten + 1).fill(0);
        for (let i = 1; i < kombis.length; i++) {
            if (kombis[i] > 0) {
                for (let s = 1; s <= seiten; s++) {
                    if (i + s < temporaer.length) {
                        temporaer[i + s] += kombis[i];
                    }
                }
            }
        }
        kombis = temporaer;
    }
    
    return kombis[zielSumme] || 0;
}

// Setzt die Statistik zurück. clearPrediction bestimmt, ob auch die Schülerschätzungen gelöscht werden.
function statistikZuruecksetzen(clearPrediction = false) {
    if (simulationsInterval) clearInterval(simulationsInterval); 
    
    const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);
    
    globaleStatistik = {};
    letztesUpdateProBalken = {};
    gesamtWuerfeZaehler = 0; 
    rohdatenProtokoll = []; 
    simulationsStartZeitpunkt = null;
    simulationGestartet = false; 

    let minSumme = anzahlWuerfel;
    let maxSumme = anzahlWuerfel * seiten;
    const anzahlKlassen = maxSumme - minSumme + 1;
    
    if (clearPrediction || !schuelerVorhersage || schuelerVorhersage.length !== anzahlKlassen) {
        schuelerVorhersage = new Array(anzahlKlassen).fill(null);
        naechsterSchaetzIndex = 0; // Klick-Reihenfolge zurücksetzen
    }

    for (let i = minSumme; i <= maxSumme; i++) {
        globaleStatistik[i] = 0;
        letztesUpdateProBalken[i] = -99999; 
    }

    // Button-Status aktualisieren
    aktualisiereStartButtonStatus();
    document.getElementById('exportBtn').disabled = true;
}

// Aktiviert oder deaktiviert den Massenstart-Button, je nachdem ob die Klick-Schätzung vollständig ist
function aktualisiereStartButtonStatus() {
    const actionBtn = document.getElementById('actionBtn');
    if (aktuellerModus === 'massen') {
        const istVollstaendig = schuelerVorhersage.every(wert => wert !== null);
        const hatIrgendwas = schuelerVorhersage.some(wert => wert !== null);

        if (hatIrgendwas && !istVollstaendig) {
            // Schüler hat angefangen zu klicken, ist aber noch nicht fertig
            const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
            const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);
            const minSumme = anzahlWuerfel;
            const naechsteSumme = minSumme + naechsterSchaetzIndex;
            
            actionBtn.disabled = true;
            actionBtn.innerText = `Klicke ins Diagramm für Summe ${naechsteSumme}!`;
            actionBtn.style.background = "#94a3b8"; // Grau signalisiert "bitte erst klicken"
        } else {
            // Entweder komplett leer (Kurve weglassen) oder vollständig eingezeichnet
            actionBtn.disabled = false;
            actionBtn.innerText = 'Live-Simulation starten';
            actionBtn.style.background = ""; // Standard-Style verwenden
        }
    } else {
        actionBtn.disabled = false;
        actionBtn.innerText = 'Einmal würfeln';
        actionBtn.style.background = "";
    }
}

function holeBalkenGradienten(ctx, chartArea, index, key) {
    if (!chartArea) return 'rgba(30, 41, 59, 0.85)'; 

    const gesamtZiel = parseInt(document.getElementById('wurfAnzahl').value) || 1000;
    
    let abkuehlDauer;
    if (gesamtZiel > 50000) abkuehlDauer = 25;  
    else if (gesamtZiel > 10000) abkuehlDauer = 60;
    else abkuehlDauer = 100;

    let alter = gesamtWuerfeZaehler - letztesUpdateProBalken[key];
    let faktor = Math.min(1, alter / abkuehlDauer);

    faktor = faktor * faktor * (3 - 2 * faktor);

    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);

    if (aktuellerModus === 'einzel') {
        gradient.addColorStop(0, 'rgba(79, 70, 229, 0.9)');
        gradient.addColorStop(1, 'rgba(49, 46, 129, 1)');
    } else {
        let rSpitze = Math.round(56 + (30 - 56) * faktor);
        let gSpitze = Math.round(189 + (41 - 189) * faktor);
        let bSpitze = Math.round(248 + (59 - 248) * faktor);

        gradient.addColorStop(0, `rgba(${rSpitze}, ${gSpitze}, ${bSpitze}, 0.95)`);
        gradient.addColorStop(1, 'rgba(30, 41, 59, 1)');
    }

    return gradient;
}

function initChart() {
    const ctx = document.getElementById('wuerfelChart').getContext('2d');
    const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);

    let labels = Object.keys(globaleStatistik);
    let daten = Object.values(globaleStatistik);

    const gesamtKombinationen = Math.pow(seiten, anzahlWuerfel);
    const gesamtZiel = parseInt(document.getElementById('wurfAnzahl').value) || 1000;
    const bezugsMenge = (aktuellerModus === 'massen') ? gesamtZiel : (gesamtWuerfeZaehler > 0 ? gesamtWuerfeZaehler : 100);

    let theoretischeVerteilung = labels.map(summe => {
        let wege = berechneKombinationenFuerSumme(anzahlWuerfel, seiten, parseInt(summe));
        return (wege / gesamtKombinationen) * bezugsMenge;
    });

    // Stabile Skalierung für die Y-Achse im Massenmodus
    let festerMaxYWert = null;
    if (aktuellerModus === 'massen') {
        const minSumme = anzahlWuerfel;
        const maxSumme = anzahlWuerfel * seiten;
        const zentrumSumme = Math.floor((minSumme + maxSumme) / 2);
        const zentrumKombis = berechneKombinationenFuerSumme(anzahlWuerfel, seiten, zentrumSumme);
        const maxTheoretischeHoehe = (zentrumKombis / gesamtKombinationen) * gesamtZiel;
        
        festerMaxYWert = maxTheoretischeHoehe > 0 ? Math.ceil(maxTheoretischeHoehe * 1.35) : 10;
    }

    if (meinChart) {
        meinChart.destroy();
    }

    let datasets = [
        {
            label: `Empirische Häufigkeit (Reale Würfe)`,
            data: daten,
            backgroundColor: function(context) {
                const chart = context.chart;
                const {ctx, chartArea} = chart;
                if (!chartArea) return null;
                const key = chart.data.labels[context.dataIndex];
                return holeBalkenGradienten(ctx, chartArea, context.dataIndex, key);
            },
            borderColor: 'rgba(30, 41, 59, 0.3)',
            borderWidth: 1,
            borderRadius: 4,
            order: 3
