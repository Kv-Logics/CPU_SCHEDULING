document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const addProcessBtn = document.getElementById('add-process-btn');
    const simulateBtn = document.getElementById('simulate-btn');
    const algorithmSelect = document.getElementById('algorithm-select');
    const quantumInputDiv = document.getElementById('rr-quantum-input');
    const arrivalInput = document.getElementById('arrival-time-input');
    const burstInput = document.getElementById('burst-time-input');
    const priorityInput = document.getElementById('priority-input');
    const processListDiv = document.getElementById('process-list');
    
    const ganttChartDiv = document.getElementById('gantt-chart');
    const ganttAxisDiv = document.getElementById('gantt-axis');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const avgMetricsDiv = document.getElementById('average-metrics');
    const readyQueueLogContainer = document.getElementById('ready-queue-log-container');

    let processes = [];
    let readyQueueLog = [];
    const TIME_SCALE = 30; // 30px per unit of time

    // --- Process Class ---
    class Process {
        constructor(id, arrivalTime, burstTime, priority) {
            this.id = id;
            this.arrivalTime = arrivalTime;
            this.originalBurstTime = burstTime;
            this.priority = priority;
            
            // Simulation-tracking properties
            this.remainingBurstTime = burstTime;
            this.completionTime = 0;
            this.waitingTime = 0;
            this.turnaroundTime = 0;
            this.isCompleted = false;
            this.startTime = -1; 
            this.remainingQuantum = 0;
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
        const priority = parseInt(priorityInput.value);

        if (isNaN(arrival) || isNaN(burst) || isNaN(priority) || burst <= 0 || arrival < 0 || priority < 0) {
            alert("Please enter valid Arrival (>= 0), Burst (> 0), and Priority (>= 0).");
            return;
        }

        // --- FIX: Determine the next ID based on the *current* max ID in the list ---
        let nextId = 1;
        if (processes.length > 0) {
            // Find the highest ID currently in the processes array
            const maxId = Math.max(...processes.map(p => p.id));
            nextId = maxId + 1;
        } else {
            nextId = 1; // Start from 1 if the list is empty
        }
        
        const newProcess = new Process(nextId, arrival, burst, priority);
        // --- END FIX ---
        
        processes.push(newProcess);
        
        renderProcessList();
        
        // Clear inputs for next entry
        burstInput.value = "5";
        priorityInput.value = "1";
        arrivalInput.value = (parseInt(arrivalInput.value) + 1).toString(); 
    }
    
    function renderProcessList() {
        processListDiv.innerHTML = "";
        const sortedProcesses = [...processes].sort((a, b) => a.id - b.id); 
        
        sortedProcesses.forEach((p) => {
            const item = document.createElement('div');
            item.className = 'process-item';
            const originalIndex = processes.findIndex(proc => proc.id === p.id);
            item.innerHTML = `
                <span style="color: ${p.color}; font-weight: 600;">P${p.id}</span>
                <span class="text-gray-300">AT=${p.arrivalTime}, BT=${p.originalBurstTime}, Pri=${p.priority}</span>
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
        quantumInputDiv.style.display = (alg === 'rr' || alg.includes('priority-rr')) ? 'block' : 'none';
    }

    function runSimulation() {
        if (processes.length === 0) {
            alert("Please add at least one process.");
            return;
        }

        // 1. Reset Logs
        readyQueueLog = [];
        
        // 2. Reset process states before simulation
        processes.forEach(p => {
            p.remainingBurstTime = p.originalBurstTime;
            p.isCompleted = false;
            p.completionTime = 0;
            p.waitingTime = 0;
            p.turnaroundTime = 0;
            p.startTime = -1;
            p.remainingQuantum = 0;
        });
        
        // 3. Deep copy processes for simulation
        let simProcesses = structuredClone(processes);
        
        let results = [];
        let ganttData = [];
        const selectedAlgorithm = algorithmSelect.value;
        const quantum = parseInt(document.getElementById('time-quantum-input').value);

        if (selectedAlgorithm.includes('rr') && (isNaN(quantum) || quantum <= 0)) {
             alert("Please enter a valid Time Quantum for this algorithm.");
             return;
        }

        // 4. Run Simulation
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
        
        // 5. Render Results
        results.sort((a,b) => a.id - b.id);
        renderGanttChart(ganttData);
        renderResultsTable(results);
        renderReadyQueueLog(readyQueueLog);
    }

    // --- Ready Queue Logging ---
    
    function logReadyQueue(time, queue, runningProcess) {
        if (readyQueueLog.length > 0) {
            const lastLog = readyQueueLog[readyQueueLog.length - 1];
            if (lastLog.time === time) {
                 if (lastLog.runningId === 'Idle' && runningProcess) {
                     lastLog.runningId = `P${runningProcess.id}`;
                 }
                 return; 
            }
        }
        
        const queueState = queue.map(p => ({ 
            id: p.id, 
            rem: p.remainingBurstTime.toFixed(1),
            pri: p.priority 
        }));
        
        const runningId = runningProcess ? `P${runningProcess.id}` : 'Idle';
        
        readyQueueLog.push({ time, queueState, runningId });
    }
    
    function renderReadyQueueLog(log) {
        readyQueueLogContainer.innerHTML = '';
        if (log.length === 0) {
            readyQueueLogContainer.innerHTML = '<p class="text-gray-400">No simulation data.</p>';
            return;
        }

        log.forEach(entry => {
            const item = document.createElement('div');
            item.className = 'p-3 bg-black/20 rounded-lg mb-2';
            
            const queueText = entry.queueState.length > 0
                ? entry.queueState.map(p => `P${p.id} (Rem: ${p.rem})`).join(', ')
                : 'Empty';
            
            item.innerHTML = `
                <strong class="text-violet-300">Time ${entry.time}:</strong>
                <span class="text-gray-300 ml-2">Running:</span>
                <strong class="text-white">${entry.runningId}</strong>
                <br>
                <span class="text-gray-300">Ready Queue:</span>
                <span class="text-gray-400">[${queueText}]</span>
            `;
            readyQueueLogContainer.appendChild(item);
        });
        
        readyQueueLogContainer.scrollTop = readyQueueLogContainer.scrollHeight;
    }

    // --- ALGORITHM IMPLEMENTATIONS (with Logging) ---

    function simulateNonPreemptive(processes, sortCriteria) {
        let currentTime = 0;
        let ganttData = [];
        let readyQueue = [];
        let finishedProcesses = [];
        
        processes.sort((a, b) => a.arrivalTime - b.arrivalTime);
        let processIndex = 0;
        
        while (finishedProcesses.length < processes.length) {
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }
            
            if (readyQueue.length === 0) {
                logReadyQueue(currentTime, readyQueue, null); 
                if (processIndex < processes.length) {
                    const nextArrivalTime = processes[processIndex].arrivalTime;
                    if (currentTime < nextArrivalTime) {
                         ganttData.push({ id: 'Idle', start: currentTime, end: nextArrivalTime, duration: nextArrivalTime - currentTime });
                         currentTime = nextArrivalTime;
                    }
                }
                continue;
            }
            
            if (sortCriteria === 'sjf') {
                readyQueue.sort((a, b) => a.originalBurstTime - b.originalBurstTime);
            } else if (sortCriteria === 'priority') {
                readyQueue.sort((a, b) => a.priority - b.priority);
            }

            const process = readyQueue.shift();
            
            logReadyQueue(currentTime, readyQueue, process); 
            
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
        logReadyQueue(currentTime, [], null);
        return [finishedProcesses, ganttData];
    }

    function simulatePreemptive(processes, sortCriteria, quantum = Infinity) {
        let currentTime = 0;
        let ganttData = [];
        let readyQueue = [];
        let finishedProcesses = [];
        
        processes.sort((a, b) => a.arrivalTime - b.arrivalTime);
        let processIndex = 0;
        
        let currentProcess = null;

        while (finishedProcesses.length < processes.length) {
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }

            if (sortCriteria === 'srtf') {
                readyQueue.sort((a, b) => a.remainingBurstTime - b.remainingBurstTime);
            } else if (sortCriteria === 'priority' || sortCriteria === 'priority-rr') {
                readyQueue.sort((a, b) => a.priority - b.priority);
            }

            if (currentProcess) {
                let shouldPreempt = false;
                if (readyQueue.length > 0) {
                    if (sortCriteria === 'srtf' && readyQueue[0].remainingBurstTime < currentProcess.remainingBurstTime) {
                        shouldPreempt = true;
                    } else if ((sortCriteria === 'priority' || sortCriteria === 'priority-rr') && readyQueue[0].priority < currentProcess.priority) {
                        shouldPreempt = true;
                    }
                }
                
                if (sortCriteria === 'priority-rr' && currentProcess.remainingQuantum <= 0) {
                    shouldPreempt = true;
                }

                if (shouldPreempt) {
                    if (sortCriteria === 'priority-rr') {
                        currentProcess.remainingQuantum = 0; 
                    }
                    readyQueue.push(currentProcess);
                    currentProcess = null;
                }
            }
            
            if (!currentProcess && readyQueue.length > 0) {
                currentProcess = readyQueue.shift();
                if (sortCriteria === 'priority-rr' && currentProcess.remainingQuantum <= 0) {
                    currentProcess.remainingQuantum = quantum;
                }
            }
            
            logReadyQueue(currentTime, readyQueue, currentProcess);

            if (!currentProcess) {
                if (processIndex < processes.length) {
                    const nextArrivalTime = processes[processIndex].arrivalTime;
                    if (currentTime < nextArrivalTime) {
                         ganttData.push({ id: 'Idle', start: currentTime, end: nextArrivalTime, duration: nextArrivalTime - currentTime });
                         currentTime = nextArrivalTime;
                    }
                }
                continue;
            }

            const timeToCompletion = currentProcess.remainingBurstTime;
            const timeToNextArrival = (processIndex < processes.length) ? (processes[processIndex].arrivalTime - currentTime) : Infinity;
            
            let timeToRun;
            if (sortCriteria === 'priority-rr') {
                const timeToQuantumEnd = currentProcess.remainingQuantum;
                timeToRun = Math.min(timeToCompletion, timeToNextArrival, timeToQuantumEnd);
            } else {
                timeToRun = Math.min(timeToCompletion, timeToNextArrival);
            }
            
            if (timeToRun === 0 && timeToCompletion > 0 && timeToNextArrival > 0) {
                 timeToRun = 1;
            }
            if (timeToNextArrival === 0 && processIndex < processes.length) {
                 continue;
            }

            timeToRun = Math.max(0, timeToRun);

            if (timeToRun > 0) {
                ganttData.push({
                    id: `P${currentProcess.id}`,
                    start: currentTime,
                    end: currentTime + timeToRun,
                    duration: timeToRun
                });

                currentProcess.remainingBurstTime -= timeToRun;
                if (sortCriteria === 'priority-rr') {
                    currentProcess.remainingQuantum -= timeToRun;
                }
                currentTime += timeToRun;
            }

            if (currentProcess.remainingBurstTime === 0) {
                currentProcess.isCompleted = true;
                currentProcess.completionTime = currentTime;
                currentProcess.turnaroundTime = currentProcess.completionTime - currentProcess.arrivalTime;
                currentProcess.waitingTime = currentProcess.turnaroundTime - currentProcess.originalBurstTime;
                finishedProcesses.push(currentProcess);
                currentProcess = null;
            }
        }
        logReadyQueue(currentTime, [], null);
        return [finishedProcesses, ganttData];
    }

    function simulateRoundRobin(processes, quantum, sortCriteria) {
        let currentTime = 0;
        let ganttData = [];
        let readyQueue = [];
        let finishedProcesses = [];
        
        processes.sort((a, b) => a.arrivalTime - b.arrivalTime);
        let processIndex = 0;
        
        while (finishedProcesses.length < processes.length) {
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }
            
            if (readyQueue.length === 0) {
                logReadyQueue(currentTime, readyQueue, null);
                if (processIndex < processes.length) {
                    const nextArrivalTime = processes[processIndex].arrivalTime;
                    if (currentTime < nextArrivalTime) {
                         ganttData.push({ id: 'Idle', start: currentTime, end: nextArrivalTime, duration: nextArrivalTime - currentTime });
                         currentTime = nextArrivalTime;
                    }
                }
                continue;
            }
            
            if (sortCriteria === 'priority-rr') {
                 readyQueue.sort((a, b) => a.priority - b.priority);
            }

            const process = readyQueue.shift();

            logReadyQueue(currentTime, readyQueue, process);

            const timeToRun = Math.min(quantum, process.remainingBurstTime);
            
            ganttData.push({
                id: `P${process.id}`,
                start: currentTime,
                end: currentTime + timeToRun,
                duration: timeToRun
            });
            
            process.remainingBurstTime -= timeToRun;
            currentTime += timeToRun;
            
            while (processIndex < processes.length && processes[processIndex].arrivalTime <= currentTime) {
                readyQueue.push(processes[processIndex]);
                processIndex++;
            }
            
            if (process.remainingBurstTime === 0) {
                process.isCompleted = true;
                process.completionTime = currentTime;
                process.turnaroundTime = process.completionTime - process.arrivalTime;
                process.waitingTime = process.turnaroundTime - process.originalBurstTime;
                finishedProcesses.push(process);
            } else {
                readyQueue.push(process);
            }
        }
        logReadyQueue(currentTime, [], null);
        return [finishedProcesses, ganttData];
    }

    // --- Rendering Functions (Updated) ---
    function renderGanttChart(ganttData) {
        ganttChartDiv.innerHTML = '';
        ganttAxisDiv.innerHTML = '';

        if (ganttData.length === 0) return;
        
        const mergedGantt = [];
        if (ganttData.length > 0) {
            let lastSegment = { ...ganttData[0] };
            for (let i = 1; i < ganttData.length; i++) {
                if (ganttData[i].id === lastSegment.id && ganttData[i].start === lastSegment.end) {
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
        const totalWidth = Math.max(totalDuration * TIME_SCALE, 500);
        ganttChartDiv.style.width = totalWidth + 'px';
        ganttAxisDiv.style.width = totalWidth + 'px';

        let lastTime = 0;

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
                block.style.backgroundColor = '#4b5563';
                block.style.color = '#e5e7eb';
            } else {
                const p = processes.find(proc => `P${proc.id}` === segment.id);
                block.style.backgroundColor = p ? p.color : '#AAAAAA';
            }
            ganttChartDiv.appendChild(block);
            
            if (segment.end !== lastTime) {
                const mark = document.createElement('span');
                mark.className = 'gantt-time-mark';
                mark.style.left = (segment.end * TIME_SCALE) + 'px'; 
                mark.textContent = segment.end;
                ganttAxisDiv.appendChild(mark);
                lastTime = segment.end;
            }
        });
    }
    
    function renderResultsTable(results) {
        resultsTableBody.innerHTML = '';
        avgMetricsDiv.innerHTML = ''; // Clear averages

        if (results.length === 0) {
             resultsTableBody.innerHTML = '<tr><td colspan="7" class="p-3 text-center text-gray-400">No data to display.</td></tr>';
             return;
        }

        let totalWT = 0;
        let totalTAT = 0;

        results.forEach(p_orig => {
            const p = processes.find(proc => proc.id === p_orig.id); 
            const row = resultsTableBody.insertRow();
            row.className = 'hover:bg-gray-700/50';
            row.innerHTML = `
                <td class="p-3"><span class="font-semibold" style="color: ${p.color};">P${p.id}</span></td>
                <td class="p-3">${p.arrivalTime}</td>
                <td class="p-3">${p.originalBurstTime}</td>
                <td class="p-3">${p.priority}</td>
                <td class="p-3">${p_orig.completionTime.toFixed(2)}</td>
                <td class="p-3">${p_orig.waitingTime.toFixed(2)}</td>
                <td class="p-3">${p_orig.turnaroundTime.toFixed(2)}</td>
            `;
            
            totalWT += p_orig.waitingTime;
            totalTAT += p_orig.turnaroundTime;
        });
        
        const avgWT = totalWT / results.length;
        const avgTAT = totalTAT / results.length;

        avgMetricsDiv.innerHTML = `
            <p>Avg. Waiting Time: <strong class="text-white">${avgWT.toFixed(2)}</strong></p>
            <p>Avg. Turnaround Time: <strong class="text-white">${avgTAT.toFixed(2)}</strong></p>
        `;
    }
    
    function getRandomColor() {
        // Generate more vibrant, light pastel colors for dark mode
        return "hsl(" + (Math.random() * 360) + ", 90%, 75%)";
    }
    
    // --- Initial setup ---
    // Start with a clean slate, no predefined processes
    toggleQuantumInput();
    renderProcessList();
    renderResultsTable([]);
    renderReadyQueueLog([]);
});