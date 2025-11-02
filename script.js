document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const addProcessBtn = document.getElementById('add-process-btn');
    const simulateBtn = document.getElementById('simulate-btn');
    const algorithmSelect = document.getElementById('algorithm-select');
    const quantumInputDiv = document.getElementById('rr-quantum-input');
    const arrivalInput = document.getElementById('arrival-time-input');
    const burstInput = document.getElementById('burst-time-input');
    const priorityInput = document.getElementById('priority-input'); // New
    const processListDiv = document.getElementById('process-list');
    
    const ganttChartDiv = document.getElementById('gantt-chart');
    const ganttAxisDiv = document.getElementById('gantt-axis');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const avgMetricsDiv = document.getElementById('average-metrics');

    let processes = [];
    let processCounter = 1;
    const TIME_SCALE = 20; // 20px per unit of time

    // --- Process Class ---
    class Process {
        constructor(id, arrivalTime, burstTime, priority) { // Updated
            this.id = id;
            this.arrivalTime = arrivalTime;
            this.originalBurstTime = burstTime;
            this.priority = priority; // New
            
            // Simulation-tracking properties
            this.remainingBurstTime = burstTime;
            this.completionTime = 0;
            this.waitingTime = 0;
            this.turnaroundTime = 0;
            this.isCompleted = false;
            this.startTime = -1; 
            this.remainingQuantum = 0; // New
            this.color = getRandomColor();
        }
    }

    // --- Event Listeners ---
    addProcessBtn.addEventListener('click', addProcess);
    simulateBtn.addEventListener('click', runSimulation);
    algorithmSelect.addEventListener('change', toggleQuantumInput);

    // --- Core Functions ---
    function addProcess() {
        const arrival = parseInt(arrivalInput.value);
        const burst = parseInt(burstInput.value);
        const priority = parseInt(priorityInput.value); // New

        if (isNaN(arrival) || isNaN(burst) || isNaN(priority) || burst <= 0 || arrival < 0 || priority < 0) {
            alert("Please enter valid Arrival (>= 0), Burst (> 0), and Priority (>= 0).");
            return;
        }

        const newProcess = new Process(processCounter++, arrival, burst, priority); // Updated
        processes.push(newProcess);
        
        renderProcessList();
        
        // Clear inputs for next entry
        burstInput.value = "5";
        priorityInput.value = "1"; // New
        arrivalInput.value = (parseInt(arrivalInput.value) + 1).toString(); 
    }
    
    function renderProcessList() {
        processListDiv.innerHTML = "";
        processes.sort((a, b) => a.id - b.id).forEach((p, index) => { // Sort by ID for consistent display
            const item = document.createElement('div');
            item.className = 'process-item';
            // Find the original index in the 'processes' array before sorting for display
            const originalIndex = processes.findIndex(proc => proc.id === p.id);
            item.innerHTML = `
                <span><strong>P${p.id}</strong>: AT = ${p.arrivalTime}, BT = ${p.originalBurstTime}, Pri = ${p.priority}</span>
                <span class="process-item-delete" data-index="${originalIndex}">&times;</span>
            `;
            item.querySelector('.process-item-delete').addEventListener('click', () => deleteProcess(originalIndex));
            processListDiv.appendChild(item);
        });
    }
    
    function deleteProcess(index) {
        processes.splice(index, 1);
        renderProcessList();
    }

    function toggleQuantumInput() {
        const alg = algorithmSelect.value;
        // Show if alg is 'rr' or contains 'priority-rr'
        quantumInputDiv.style.display = (alg === 'rr' || alg.includes('priority-rr')) ? 'block' : 'none';
    }

    function runSimulation() {
        if (processes.length === 0) {
            alert("Please add at least one process.");
            return;
        }

        // Reset process states before simulation
        processes.forEach(p => {
            p.remainingBurstTime = p.originalBurstTime;
            p.isCompleted = false;
            p.completionTime = 0;
            p.waitingTime = 0;
            p.turnaroundTime = 0;
            p.startTime = -1;
            p.remainingQuantum = 0; // New
        });
        
        // Deep copy processes for simulation
        let simProcesses = JSON.parse(JSON.stringify(processes));
        
        let results = [];
        let ganttData = [];
        const selectedAlgorithm = algorithmSelect.value;
        const quantum = parseInt(document.getElementById('time-quantum-input').value);

        if (selectedAlgorithm.includes('rr') && (isNaN(quantum) || quantum <= 0)) {
             alert("Please enter a valid Time Quantum for this algorithm.");
             return;
        }

        switch (selectedAlgorithm) {
            case 'fcfs':
                [results, ganttData] = simulateNonPreemptive(simProcesses, 'fcfs');
                break;
            case 'sjf-nonpreemptive':
                [results, ganttData] = simulateNonPreemptive(simProcesses, 'sjf');
                break;
            case 'priority-nonpreemptive':
                [results, ganttData] = simulateNonPreemptive(simProcesses, 'priority');
                break;
            case 'srtf-preemptive':
                [results, ganttData] = simulatePreemptive(simProcesses, 'srtf');
                break;
            case 'priority-preemptive':
                [results, ganttData] = simulatePreemptive(simProcesses, 'priority');
                break;
            case 'rr':
                [results, ganttData] = simulateRoundRobin(simProcesses, quantum, 'rr');
                break;
            case 'priority-rr-nonpreemptive':
                [results, ganttData] = simulateRoundRobin(simProcesses, quantum, 'priority-rr');
                break;
            case 'priority-rr-preemptive':
                [results, ganttData] = simulatePreemptive(simProcesses, 'priority-rr', quantum);
                break;
            default:
                alert("Algorithm not yet implemented.");
                return;
        }
        
        // Sort results by ID for table display
        results.sort((a,b) => a.id - b.id);

        renderGanttChart(ganttData);
        renderResultsTable(results);
    }

    // --- ALGORITHM IMPLEMENTATIONS ---

    /**
     * Engine for Non-Preemptive algorithms (FCFS, SJF, Priority-NP)
     * @param {Array} processes - The list of processes to simulate.
     * @param {string} sortCriteria - 'fcfs', 'sjf', or 'priority'.
     */
    function simulateNonPreemptive(processes, sortCriteria) {
        let currentTime = 0;
        let ganttData = [];
        let readyQueue = [];
        let finishedProcesses = [];
        let processIndex = 0;
        
        processes.sort((a, b) => a.arrivalTime - b.arrivalTime);
        
        while (finishedProcesses.length < processes.length) {
            // 1. Add processes that have arrived to the ready queue
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }
            
            // 2. If ready queue is empty, CPU is idle
            if (readyQueue.length === 0) {
                // If there are still processes left to arrive, advance time
                if (processIndex < processes.length) {
                    const nextArrivalTime = processes[processIndex].arrivalTime;
                    if (currentTime < nextArrivalTime) {
                         ganttData.push({ id: 'Idle', start: currentTime, end: nextArrivalTime, duration: nextArrivalTime - currentTime });
                         currentTime = nextArrivalTime;
                    }
                }
                continue; // Loop again to add the newly arrived process
            }
            
            // 3. Sort the ready queue based on the algorithm
            if (sortCriteria === 'sjf') {
                readyQueue.sort((a, b) => a.originalBurstTime - b.originalBurstTime);
            } else if (sortCriteria === 'priority') {
                readyQueue.sort((a, b) => a.priority - b.priority);
            }
            // For 'fcfs', no sort is needed as arrival order is maintained.

            // 4. Get next process from queue
            const process = readyQueue.shift();
            
            // 5. Run process to completion (non-preemptive)
            const startTime = currentTime;
            process.startTime = startTime;
            process.completionTime = startTime + process.originalBurstTime;
            process.turnaroundTime = process.completionTime - process.arrivalTime;
            process.waitingTime = process.turnaroundTime - process.originalBurstTime;
            process.isCompleted = true;
            
            ganttData.push({ 
                id: `P${process.id}`,
                start: startTime,
                end: process.completionTime,
                duration: process.originalBurstTime
            });

            currentTime = process.completionTime;
            finishedProcesses.push(process);
        }

        return [finishedProcesses, ganttData];
    }

    /**
     * Engine for Preemptive algorithms (SRTF, Priority-P, Priority-RR-P)
     * @param {Array} processes - The list of processes to simulate.
     * @param {string} sortCriteria - 'srtf', 'priority', or 'priority-rr'.
     * @param {number} [quantum] - The time quantum (only for 'priority-rr').
     */
    function simulatePreemptive(processes, sortCriteria, quantum = Infinity) {
        let currentTime = 0;
        let ganttData = [];
        let readyQueue = [];
        let finishedProcesses = [];
        let processIndex = 0;

        processes.sort((a, b) => a.arrivalTime - b.arrivalTime);
        
        while (finishedProcesses.length < processes.length) {
            // 1. Add processes that have arrived
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }

            // 2. If ready queue is empty, handle idle time
            if (readyQueue.length === 0) {
                if (processIndex < processes.length) {
                    const nextArrivalTime = processes[processIndex].arrivalTime;
                    if (currentTime < nextArrivalTime) {
                         ganttData.push({ id: 'Idle', start: currentTime, end: nextArrivalTime, duration: nextArrivalTime - currentTime });
                         currentTime = nextArrivalTime;
                    }
                }
                continue;
            }
            
            // 3. Sort the ready queue
            if (sortCriteria === 'srtf') {
                readyQueue.sort((a, b) => a.remainingBurstTime - b.remainingBurstTime);
            } else if (sortCriteria === 'priority' || sortCriteria === 'priority-rr') {
                readyQueue.sort((a, b) => a.priority - b.priority);
            }

            // 4. Pick the best process
            const process = readyQueue.shift();
            
            // 5. For Priority-RR, reset quantum if it's a new process or quantum expired
            if (sortCriteria === 'priority-rr' && process.remainingQuantum <= 0) {
                process.remainingQuantum = quantum;
            }

            // 6. Determine how long this process can run
            const timeToCompletion = process.remainingBurstTime;
            const timeToNextArrival = (processIndex < processes.length) ? (processes[processIndex].arrivalTime - currentTime) : Infinity;
            
            let timeToRun;
            if (sortCriteria === 'priority-rr') {
                const timeToQuantumEnd = process.remainingQuantum;
                timeToRun = Math.min(timeToCompletion, timeToNextArrival, timeToQuantumEnd);
            } else {
                timeToRun = Math.min(timeToCompletion, timeToNextArrival);
            }

            // Ensure we make progress if events happen at the same time
            if (timeToRun === 0) {
                 if(timeToNextArrival === 0) continue; // Let new arrival be processed
                 timeToRun = 1; // Failsafe for simultaneous completion/arrival
                 if (timeToRun > timeToCompletion) timeToRun = timeToCompletion;
            }


            // 7. Execute the process
            ganttData.push({
                id: `P${process.id}`,
                start: currentTime,
                end: currentTime + timeToRun,
                duration: timeToRun
            });

            process.remainingBurstTime -= timeToRun;
            if (sortCriteria === 'priority-rr') {
                process.remainingQuantum -= timeToRun;
            }
            currentTime += timeToRun;

            // 8. Check if process finished or needs to be re-queued
            if (process.remainingBurstTime === 0) {
                process.isCompleted = true;
                process.completionTime = currentTime;
                process.turnaroundTime = process.completionTime - process.arrivalTime;
                process.waitingTime = process.turnaroundTime - process.originalBurstTime;
                finishedProcesses.push(process);
            } else {
                // Not finished, add back to ready queue
                readyQueue.push(process);
            }
        }
        
        return [finishedProcesses, ganttData];
    }


    /**
     * Engine for Round Robin algorithms (Standard RR, Priority-RR-NP)
     * @param {Array} processes - The list of processes to simulate.
     * @param {number} quantum - The time quantum.
     * @param {string} sortCriteria - 'rr' or 'priority-rr'.
     */
    function simulateRoundRobin(processes, quantum, sortCriteria) {
        let currentTime = 0;
        let ganttData = [];
        let readyQueue = [];
        let finishedProcesses = [];
        let processIndex = 0;
        
        processes.sort((a, b) => a.arrivalTime - b.arrivalTime);
        
        while (finishedProcesses.length < processes.length) {
            // 1. Add processes that have arrived
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }
            
            // 2. If ready queue is empty, handle idle time
            if (readyQueue.length === 0) {
                if (processIndex < processes.length) {
                    const nextArrivalTime = processes[processIndex].arrivalTime;
                    if (currentTime < nextArrivalTime) {
                         ganttData.push({ id: 'Idle', start: currentTime, end: nextArrivalTime, duration: nextArrivalTime - currentTime });
                         currentTime = nextArrivalTime;
                    }
                }
                continue;
            }
            
            // 3. Sort the ready queue if it's Priority-RR
            if (sortCriteria === 'priority-rr') {
                 readyQueue.sort((a, b) => a.priority - b.priority);
            }

            // 4. Get next process from queue
            const process = readyQueue.shift();

            // 5. Run process for quantum or remaining time
            const timeToRun = Math.min(quantum, process.remainingBurstTime);
            
            ganttData.push({
                id: `P${process.id}`,
                start: currentTime,
                end: currentTime + timeToRun,
                duration: timeToRun
            });
            
            process.remainingBurstTime -= timeToRun;
            currentTime += timeToRun;
            
            // 6. Add any newly arrived processes during this run
            // This is the key difference from the "preemptive" engine:
            // new arrivals wait until the quantum is finished.
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }
            
            // 7. Check if process finished or needs to be re-queued
            if (process.remainingBurstTime === 0) {
                process.isCompleted = true;
                process.completionTime = currentTime;
                process.turnaroundTime = process.completionTime - process.arrivalTime;
                process.waitingTime = process.turnaroundTime - process.originalBurstTime;
                finishedProcesses.push(process);
            } else {
                // Not finished, add back to end of queue
                readyQueue.push(process);
            }
        }
        
        return [finishedProcesses, ganttData];
    }


    // --- Rendering Functions ---
    function renderGanttChart(ganttData) {
        ganttChartDiv.innerHTML = '';
        ganttAxisDiv.innerHTML = '';

        if (ganttData.length === 0) return;
        
        // Merge consecutive blocks of the same process
        const mergedGantt = [];
        if (ganttData.length > 0) {
            let lastSegment = { ...ganttData[0] };
            for (let i = 1; i < ganttData.length; i++) {
                if (ganttData[i].id === lastSegment.id) {
                    lastSegment.end = ganttData[i].end;
                    lastSegment.duration += ganttData[i].duration;
                } else {
                    mergedGantt.push(lastSegment);
                    lastSegment = { ...ganttData[i] };
                }
            }
            mergedGantt.push(lastSegment);
        }
        
        const totalDuration = mergedGantt[mergedGantt.length - 1].end;
        const totalWidth = Math.max(totalDuration * TIME_SCALE, 500); // Min width
        ganttChartDiv.style.width = totalWidth + 'px';
        ganttAxisDiv.style.width = totalWidth + 'px';

        let lastTime = 0;

        // Add 0-mark
        const zeroMark = document.createElement('span');
        zeroMark.className = 'gantt-time-mark';
        zeroMark.style.left = '0px';
        zeroMark.textContent = '0';
        ganttAxisDiv.appendChild(zeroMark);
        
        mergedGantt.forEach(segment => {
            const block = document.createElement('div');
            block.className = 'gantt-block';
            block.style.width = (segment.duration * TIME_SCALE) + 'px';
            block.textContent = segment.id;
            
            if (segment.id === 'Idle') {
                block.style.backgroundColor = '#E0E0E0';
                block.style.color = '#777';
            } else {
                // Find original process to get color
                const p = processes.find(proc => `P${proc.id}` === segment.id);
                block.style.backgroundColor = p ? p.color : '#AAAAAA';
            }
            ganttChartDiv.appendChild(block);
            
            // Add time mark
            if (segment.end !== lastTime) {
                const mark = document.createElement('span');
                mark.className = 'gantt-time-mark';
                // Position mark at the end of the block
                mark.style.left = (segment.end * TIME_SCALE) + 'px'; 
                mark.textContent = segment.end;
                ganttAxisDiv.appendChild(mark);
                lastTime = segment.end;
            }
        });
    }
    
    function renderResultsTable(results) {
        resultsTableBody.innerHTML = '';

        if (results.length === 0) return;

        let totalWT = 0;
        let totalTAT = 0;

        results.forEach(p => {
            const row = resultsTableBody.insertRow();
            row.insertCell().textContent = `P${p.id}`;
            row.insertCell().textContent = p.arrivalTime;
            row.insertCell().textContent = p.originalBurstTime;
            row.insertCell().textContent = p.priority; // New
            row.insertCell().textContent = p.completionTime.toFixed(2);
            row.insertCell().textContent = p.waitingTime.toFixed(2);
            row.insertCell().textContent = p.turnaroundTime.toFixed(2);
            
            totalWT += p.waitingTime;
            totalTAT += p.turnaroundTime;
        });
        
        const avgWT = totalWT / results.length;
        const avgTAT = totalTAT / results.length;

        avgMetricsDiv.innerHTML = `
            <p>Average Waiting Time (AWT): <strong>${avgWT.toFixed(2)}</strong></p>
            <p>Average Turnaround Time (ATAT): <strong>${avgTAT.toFixed(2)}</strong></p>
        `;
    }
    
    function getRandomColor() {
        // Generate softer pastel colors
        return "hsl(" + (Math.random() * 360) + ", 70%, 80%)";
    }
    
    // Initial setup
    toggleQuantumInput();
    // Add one default process to start
    arrivalInput.value = "0";
    burstInput.value = "5";
    priorityInput.value = "1";
    addProcess(); 
});