let meinChart = null;
let globaleStatistik = {}; 
let gesamtWuerfeZaehler = 0; 
let aktuellerModus = 'einzel'; 
let simulationsInterval = null; 

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

function statistikZuruecksetzen() {
    if (simulationsInterval) clearInterval(simulationsInterval); 
    
    const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);
    
    globaleStatistik = {};
    letztesUpdateProBalken = {};
    gesamtWuerfeZaehler = 0; 
    rohdatenProtokoll = []; 
    simulationsStartZeitpunkt = null;

    let minSumme = anzahlWuerfel;
    let maxSumme = anzahlWuerfel * seiten;
    for (let i = minSumme; i <= maxSumme; i++) {
        globaleStatistik[i] = 0;
        letztesUpdateProBalken[i] = -99999; 
    }

    document.getElementById('exportBtn').disabled = true;
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
    const bezugsMenge = gesamtWuerfeZaehler > 0 ? gesamtWuerfeZaehler : 100;

    let theoretischeVerteilung = labels.map(summe => {
        let wege = berechneKombinationenFuerSumme(anzahlWuerfel, seiten, parseInt(summe));
        return (wege / gesamtKombinationen) * bezugsMenge;
    });

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
            order: 2
        }
    ];

    if (aktuellerModus === 'massen') {
        datasets.push({
            label: `Mathematische Vorhersage-Kurve`,
            data: theoretischeVerteilung,
            type: 'line',
            borderColor: '#ef4444',
            borderWidth: 3,
            pointRadius: labels.length > 30 ? 0 : 3,
            pointBackgroundColor: '#ef4444',
            tension: 0.3,
            fill: false,
            order: 1
        });
    }

    meinChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            animation: false, 
            scales: {
                y: { beginAtZero: true, grid: { color: '#e2e8f0' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        // Fügt den Live-Zähler als extra Eintrag an die Spitze der Legende an
                        generateLabels: function(chart) {
                            let standardLabels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                            standardLabels.unshift({
                                text: `Gesamte Würfe: ${gesamtWuerfeZaehler.toLocaleString()}`,
                                fillStyle: 'rgba(6, 182, 212, 0.2)',
                                strokeStyle: 'rgba(6, 182, 212, 1)',
                                lineWidth: 2,
                                hidden: false,
                                index: -1
                            });
                            return standardLabels;
                        }
                    }
                }
            }
        }
    });
}

function aktualisiereChart() {
    if (!meinChart) return;
    
    const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);
    const gesamtKombinationen = Math.pow(seiten, anzahlWuerfel);
    const bezugsMenge = gesamtWuerfeZaehler > 0 ? gesamtWuerfeZaehler : 100;

    meinChart.data.datasets[0].data = Object.values(globaleStatistik);
    
    if (meinChart.data.datasets[1]) {
        meinChart.data.datasets[1].data = meinChart.data.labels.map(summe => {
            let wege = berechneKombinationenFuerSumme(anzahlWuerfel, seiten, parseInt(summe));
            return (wege / gesamtKombinationen) * bezugsMenge;
        });
    }

    meinChart.update('none'); 
}

function updateDidaktikText() {
    const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);
    const infoDiv = document.getElementById('didaktikInhalt');
    
    const kombinationen = Math.pow(seiten, anzahlWuerfel);
    const minSumme = anzahlWuerfel;
    const maxSumme = anzahlWuerfel * seiten;
    
    const zentrumSumme = Math.floor((minSumme + maxSumme) / 2);
    const zentrumKombis = berechneKombinationenFuerSumme(anzahlWuerfel, seiten, zentrumSumme);
    const zentrumWahrscheinlichkeit = ((zentrumKombis / kombinationen) * 100).toFixed(2);
    const randWahrscheinlichkeit = ((1 / kombinationen) * 100).toFixed(4);

    let erklaerung = `<p>Aktuelle Konfiguration: <b>${anzahlWuerfel}x W${seiten}</b> mit Summen von ${minSumme} bis ${maxSumme}. Kombinationsraum: <b>${seiten}^${anzahlWuerfel} = ${kombinationen.toLocaleString()}</b> Möglichkeiten.</p>`;

    if (anzahlWuerfel === 1) {
        erklaerung += `
            <h3>📊 Die Gleichverteilung (1 Würfel)</h3>
            <p>Wenn du mit nur einem Würfel wirfst, hat jede Zahl von 1 bis ${seiten} exakt die gleiche Wahrscheinlichkeit (1 / ${seiten} bzw. ${zentrumWahrscheinlichkeit}%). Das Diagramm bildet bei vielen Würfen ein flaches Plateau. Es gibt keine Bevorzugung der Mitte.</p>
        `;
    } else if (anzahlWuerfel === 2) {
        let beispielZentrumWeg = `(1,${zentrumSumme-1}), (2,${zentrumSumme-2})...`;
        if (seiten == 6) beispielZentrumWeg = `(1,6), (2,5), (3,4), (4,3), (5,2), (6,1)`;

        erklaerung += `
            <h3>📐 Die Dreiecksverteilung (Exakt 2 Würfel)</h3>
            <p>Sobald ein zweiter Würfel ins Spiel kommt, entsteht im Diagramm eine perfekte <b>Dreiecksform</b>. Das liegt daran, dass die Anzahl der Kombinationsmöglichkeiten linear zur Mitte hin zu- und nach der Mitte wieder abnimmt:</p>
            <ul>
                <li><b>Die Ränder (Summe ${minSumme} oder ${maxSumme}):</b> Für diese Extremwerte gibt es jeweils nur <b>1 einzige</b> Kombination – z.B. nur ein einziges [1, 1], um die Summe ${minSumme} zu erzielen. Die Wahrscheinlichkeit liegt bei gerade einmal <b>${randWahrscheinlichkeit}%</b>.</li>
                <li><b>Die exakte Mitte (Summe ${zentrumSumme}):</b> Hier gibt es die meisten Kombinationen, nämlich genau <b>${zentrumKombis}</b> verschiedene Wege (z.B. ${beispielZentrumWeg}). Die Wahrscheinlichkeit für dieses eine Ergebnis steigt sprunghaft auf <b>${zentrumWahrscheinlichkeit}%</b> an!</li>
            </ul>
            <p>Dieser gleichmäßige, lineare Anstieg und Abstieg der Kombinationspfade formt geometrisch ein exaktes Dreieck.</p>
        `;
    } else {
        erklaerung += `
            <h3>🔔 Die Glockenverteilung / Normalverteilung (ab 3 Würfeln)</h3>
            <p>Sobald du mit <b>${anzahlWuerfel} Würfeln</b> arbeitest, verwandelt sich das spitze Dreieck in eine sanft geschwungene, abgerundete <b>Glockenkurve</b> (Gaußsche Normalverteilung).</p>
            <h3>Woher kommt diese Glockenform bei deiner Konfiguration?</h3>
            <p>Dahinter steckt der <b>Zentrale Grenzwertsatz</b> der Statistik, der sich an deinen eingestellten Zahlen mathematisch perfekt zeigen lässt:</p>
            <ul>
                <li><b>Extreme Isolation an den Rändern:</b> Um die absolute Minimalsumme <b>${minSumme}</b> zu würfeln, muss jeder einzelne Würfel eine Eins zeigen: [${new Array(anzahlWuerfel).fill(1).join(', ')}]. Dafür gibt es nach wie vor nur <b>1 einzige</b> Kombination aus den ${kombinationen.toLocaleString()} Möglichkeiten (Wahrscheinlichkeit: <b>${randWahrscheinlichkeit}%</b>).</li>
                <li><b>Kombinatorische Explosion im Zentrum:</b> Für die mittlere Augensumme von <b>${zentrumSumme}</b> explodiert die Anzahl der Kombinationspfade regelrecht auf stolze <b>${zentrumKombis.toLocaleString()}</b> verschiedene Wege! Die Wahrscheinlichkeit, genau in der Mitte zu landen, beträgt bei dir damit <b>${zentrumWahrscheinlichkeit}%</b>.</li>
                <li><b>Die mathematische Faltung:</b> Da bei ${anzahlWuerfel} Würfeln unzählige Zwischenstufen existieren, flachen die harten, spitzen Kanten ab. Die Wahrscheinlichkeiten steigen nicht mehr linear, sondern kurvenförmig an. Je mehr Würfel du hinzufügst, desto runder und perfekter wird diese Glocke.</li>
            </ul>
        `;
    }

    infoDiv.innerHTML = erklaerung;
}

function addWurfToHistory(einzelwerte, summe) {
    const list = document.getElementById('historyList');
    const entry = document.createElement('li');
    entry.innerHTML = `🎲 Würfel: [${einzelwerte.join(', ')}] ➔ <b>Augensumme: ${summe}</b>`;
    
    list.insertBefore(entry, list.firstChild);
    
    while (list.children.length > 3) {
        list.removeChild(list.lastChild);
    }
}

function holeVergangeneSimulationsZeit() {
    if (!simulationsStartZeitpunkt) return "00:00.000";
    
    const jetzt = performance.now();
    const differenzInMilliSekunden = jetzt - simulationsStartZeitpunkt;
    
    const gesamtSekunden = Math.floor(differenzInMilliSekunden / 1000);
    const minuten = String(Math.floor(gesamtSekunden / 60)).padStart(2, '0');
    const sekunden = String(gesamtSekunden % 60).padStart(2, '0');
    const milliSekunden = String(Math.floor(differenzInMilliSekunden % 1000)).padStart(3, '0');
    
    return `${minuten}:${sekunden}.${milliSekunden}`;
}

function fuehreAktionAus() {
    if (simulationsInterval) clearInterval(simulationsInterval);

    const seiten = parseInt(document.getElementById('wuerfelSeiten').value);
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);

    if (!simulationsStartZeitpunkt) {
        simulationsStartZeitpunkt = performance.now();
    }

    if (aktuellerModus === 'einzel') {
        const container = document.getElementById('diceContainer');
        container.innerHTML = ''; 
        
        let summe = 0;
        let einzelErgebnisse = [];
        for (let j = 0; j < anzahlWuerfel; j++) {
            let wurf = wuerfleEinmal(seiten);
            einzelErgebnisse.push(wurf);
            summe += wurf;
        }
        
        einzelErgebnisse.forEach(wert => {
            const diceHtml = document.createElement('div');
            diceHtml.className = 'visual-dice';
            diceHtml.innerText = wert;
            container.appendChild(diceHtml);
        });

        globaleStatistik[summe]++;
        gesamtWuerfeZaehler++; 
        letztesUpdateProBalken[summe] = gesamtWuerfeZaehler; 

        rohdatenProtokoll.push({
            id: gesamtWuerfeZaehler,
            zeit: holeVergangeneSimulationsZeit(),
            einzel: [...einzelErgebnisse],
            summe: summe
        });

        aktualisiereChart();
        addWurfToHistory(einzelErgebnisse, summe);
        document.getElementById('exportBtn').disabled = false;

        document.getElementById('wurfErgebnisText').innerText = 
            `Ergebnis: ${einzelErgebnisse.join(' + ')} = Augensumme ${summe}`;
            
    } else {
        let inputField = document.getElementById('wurfAnzahl');
        let gesamtWuerfeZiel = parseInt(inputField.value) || 1000;
        
        if (gesamtWuerfeZiel > 100000) {
            gesamtWuerfeZiel = 100000;
            inputField.value = 100000; 
            alert("Sicherheitshinweis: Die maximale Wurfanzahl ist auf 100.000 begrenzt.");
        }
        
        statistikZuruecksetzen();
        initChart(); 
        document.getElementById('exportBtn').disabled = true; 
        
        simulationsStartZeitpunkt = performance.now();
        
        let chunks = 1;
        if (gesamtWuerfeZiel > 50000) chunks = 300;
        else if (gesamtWuerfeZiel > 10000) chunks = 80;
        else if (gesamtWuerfeZiel > 2000) chunks = 15;
        else chunks = 2; 

        const intervallDauer = 40; 

        simulationsInterval = setInterval(() => {
            if (gesamtWuerfeZaehler >= gesamtWuerfeZiel) {
                clearInterval(simulationsInterval);
                document.getElementById('wurfErgebnisText').innerText = `Simulation beendet! ${gesamtWuerfeZaehler.toLocaleString()} Würfe vollendet.`;
                aktualisiereChart();
                document.getElementById('exportBtn').disabled = false; 
                return;
            }

            const relativerZeitstempel = holeVergangeneSimulationsZeit();

            for (let i = 0; i < chunks; i++) {
                if (gesamtWuerfeZaehler >= gesamtWuerfeZiel) break;
                
                let summe = 0;
                let einzelErgebnisse = [];
                for (let j = 0; j < anzahlWuerfel; j++) {
                    let wurf = wuerfleEinmal(seiten);
                    einzelErgebnisse.push(wurf);
                    summe += wurf;
                }
                globaleStatistik[summe]++;
                gesamtWuerfeZaehler++;
                letztesUpdateProBalken[summe] = gesamtWuerfeZaehler; 

                rohdatenProtokoll.push({
                    id: gesamtWuerfeZaehler,
                    zeit: relativerZeitstempel,
                    einzel: einzelErgebnisse,
                    summe: summe
                });
            }

            aktualisiereChart();
            document.getElementById('wurfErgebnisText').innerText = `Simuliere live... ${gesamtWuerfeZaehler.toLocaleString()} / ${gesamtWuerfeZiel.toLocaleString()}`;
        }, intervallDauer);
    }
}

function exportiereRohdatenAlsCSV() {
    if (rohdatenProtokoll.length === 0) return;

    const seiten = document.getElementById('wuerfelSeiten').value;
    const anzahlWuerfel = parseInt(document.getElementById('wuerfelAnzahl').value);

    let csvHeader = ["ID", "Simulationszeit"];
    for (let i = 1; i <= anzahlWuerfel; i++) {
        csvHeader.push(`Wuerfel_${i}`);
    }
    csvHeader.push("Augensumme");

    let csvInhalt = csvHeader.join(";") + "\n";

    rohdatenProtokoll.forEach(wurf => {
        let zeile = [wurf.id, wurf.zeit];
        for (let i = 0; i < anzahlWuerfel; i++) {
            zeile.push(wurf.einzel[i] || 0);
        }
        zeile.push(wurf.summe);
        csvInhalt += zeile.join(";") + "\n";
    });

    const blob = new Blob([csvInhalt], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    
    downloadLink.setAttribute("href", url);
    downloadLink.setAttribute("download", `WuerfelLabor_TimerDaten_${anzahlWuerfel}xW${seiten}.csv`);
    downloadLink.style.visibility = 'hidden';
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

function wechsleModus(modus) {
    aktuellerModus = modus;
    if (simulationsInterval) clearInterval(simulationsInterval);

    const tabEinzel = document.getElementById('tabEinzel');
    const tabMassen = document.getElementById('tabMassen');
    const massenInputGroup = document.getElementById('massenInputGroup');
    const visualCard = document.getElementById('visualCard');
    const actionBtn = document.getElementById('actionBtn');

    if (modus === 'einzel') {
        tabEinzel.classList.add('active');
        tabMassen.classList.remove('active');
        massenInputGroup.classList.add('hidden');
        visualCard.classList.remove('hidden');
        actionBtn.innerText = 'Einmal würfeln';
        document.getElementById('wurfErgebnisText').innerText = 'Klicke auf "Einmal würfeln"!';
    } else {
        tabMassen.classList.add('active');
        tabEinzel.classList.remove('active');
        massenInputGroup.classList.remove('hidden');
        visualCard.classList.add('hidden');
        actionBtn.innerText = 'Live-Simulation starten';
        document.getElementById('wurfErgebnisText').innerText = 'Bereit für das Live-Wachstum der Kurve.';
    }
    
    document.getElementById('historyList').innerHTML = ''; 
    statistikZuruecksetzen();
    initChart();
    updateDidaktikText();
}

document.getElementById('actionBtn').addEventListener('click', fuehreAktionAus);
document.getElementById('exportBtn').addEventListener('click', exportiereRohdatenAlsCSV);

document.getElementById('resetBtn').addEventListener('click', () => {
    statistikZuruecksetzen();
    initChart();
    document.getElementById('historyList').innerHTML = '';
    if(aktuellerModus === 'einzel') {
        document.getElementById('diceContainer').innerHTML = '';
        document.getElementById('wurfErgebnisText').innerText = 'Statistik zurückgesetzt!';
    }
});

document.getElementById('tabEinzel').addEventListener('click', () => wechsleModus('einzel'));
document.getElementById('tabMassen').addEventListener('click', () => wechsleModus('massen'));

const einstellungsIds = ['wuerfelSeiten', 'wuerfelAnzahl'];
einstellungsIds.forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        statistikZuruecksetzen();
        initChart();
        updateDidaktikText();
        document.getElementById('diceContainer').innerHTML = '';
        document.getElementById('historyList').innerHTML = '';
    });
});

window.onload = () => {
    wechsleModus('einzel');
};