document.addEventListener('DOMContentLoaded', () => {
  // 設定画面用要素
  const configScreen = document.getElementById('config-screen');
  const studentInfoTextarea = document.getElementById('student-info');
  const rowCountSelect = document.getElementById('row-count');
  const colCountSelect = document.getElementById('col-count');
  const previewGridContainer = document.getElementById('preview-grid');
  const assignmentOrderSelect = document.getElementById('assignment-order');
  const autoModeSelect = document.getElementById('auto-mode');
  const autoIntervalContainer = document.getElementById('auto-interval-container');
  const autoIntervalInput = document.getElementById('auto-interval');
  const startAssignmentButton = document.getElementById('start-assignment-button');
  const autoNumberCheckbox = document.getElementById('auto-number');
  const showFuriganaCheckbox = document.getElementById('show-furigana');

  
  // 席替え画面用要素
  const assignmentScreen = document.getElementById('assignment-screen');
  const assignButton = document.getElementById('assign-button');
  const instruction = document.getElementById('instruction');
  const seatTable = document.getElementById('seat-table');
  const leftPane = document.getElementById('left-pane');

  // グローバル変数
  let students = [];
  let rows, cols;
  let excludedSeats = []; // プレビューで「使わない席」と指定されたセル
  let occupiedSeats = [];
  let currentIndex = 0;
  let lastNewAssignedCell = null;
  let autoMode = false;
  let autoInterval = 0;
  let autoTimer = null;
  let isTeacherView = false; // 教師視点（黒板下、席反転）かどうか

  // プレビューグリッド生成
  generatePreviewGrid();

  // プレビュー用：行数、列数変更時に再生成
  rowCountSelect.addEventListener('change', generatePreviewGrid);
  colCountSelect.addEventListener('change', generatePreviewGrid);

  // オートモード選択で間隔入力表示の切替
  autoModeSelect.addEventListener('change', () => {
    if (autoModeSelect.value === 'auto') {
      autoIntervalContainer.style.display = 'block';
    } else {
      autoIntervalContainer.style.display = 'none';
    }
  });

  // 「席替えを始める」ボタン
  startAssignmentButton.addEventListener('click', () => {
    // 学生情報のパース
    const lines = studentInfoTextarea.value.split('\n').filter(line => line.trim() !== '');
    try {
      if (autoNumberCheckbox.checked) {
        // 自動割り当てONの場合
        students = lines.map((line, index) => {
          const parts = line.split(',').map(p => p.trim());
          if (showFuriganaCheckbox.checked) {
            // 入力形式は「名前, 読み仮名」かどうか
            if (parts.length !== 2 || !parts[0]) {
              throw new Error(`フォーマットエラー：自動割り当てON, 読み仮名ONの場合は「名前, 読み仮名」を入力してください。（対象行：${line}）`);
            }
            return { number: index + 1, name: parts[0], reading: parts[1] };
          } else {
            // 入力形式は「名前」だけであること
            if (parts.length !== 1 || !parts[0]) {
              throw new Error(`フォーマットエラー：自動割り当てON, 読み仮名OFFの場合は「名前」のみを入力してください。（対象行：${line}）`);
            }
            return { number: index + 1, name: parts[0], reading: "" };
          }
        });
      } else {
        // 自動割り当てOFFの場合
        students = lines.map(line => {
          const parts = line.split(',').map(p => p.trim());
          if (showFuriganaCheckbox.checked) {
            // 入力形式は「番号, 名前, 読み仮名」
            if (parts.length !== 3 || isNaN(parseInt(parts[0], 10)) || !parts[1]) {
              throw new Error(`フォーマットエラー：番号の自動割り当てOFF, 読み仮名ONの場合は「番号, 名前, 読み仮名」を入力してください。（対象行：${line}）`);
            }
            return { number: parseInt(parts[0], 10), name: parts[1], reading: parts[2] };
          } else {
            // 入力形式は「番号, 名前」
            if (parts.length !== 2 || isNaN(parseInt(parts[0], 10)) || !parts[1]) {
              throw new Error(`フォーマットエラー：番号の自動割り当てOFF, 読み仮名OFFの場合は「番号, 名前」を入力してください。（対象行：${line}）`);
            }
            return { number: parseInt(parts[0], 10), name: parts[1], reading: "" };
          }
        });
      }
    } catch (e) {
      alert(e.message);
      return;
    }    
    
    // 座席の行数・列数の設定
    rows = parseInt(rowCountSelect.value, 10);
    cols = parseInt(colCountSelect.value, 10);

    // プレビューグリッドから除外席を取得
    excludedSeats = [];
    previewGridContainer.querySelectorAll('button').forEach(btn => {
      const r = parseInt(btn.getAttribute('data-row'), 10);
      const c = parseInt(btn.getAttribute('data-col'), 10);
      if (btn.classList.contains('excluded')) {
        excludedSeats.push({ row: r, col: c });
      }
    });

    // 利用可能な席数チェック
    const totalSeats = rows * cols;
    const availableSeats = totalSeats - excludedSeats.length;
    if (availableSeats != students.length) {
      alert(`席数(${availableSeats})が生徒数(${students.length})と一致しません。席数を調整してください。`);
      return;
    }

    // 席決定順の処理
    const order = assignmentOrderSelect.value;
    if (order === 'asc') {
      students.sort((a, b) => a.number - b.number);
    } else if (order === 'desc') {
      students.sort((a, b) => b.number - a.number);
    } else if (order === 'random') {
      for (let i = students.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [students[i], students[j]] = [students[j], students[i]];
      }
    }
    
    // オートモード設定
    autoMode = (autoModeSelect.value === 'auto');
    if (autoMode) {
      autoInterval = parseFloat(autoIntervalInput.value);
      if (isNaN(autoInterval) || autoInterval < 0) {
        alert('正しい間隔（秒）を入力してください。');
        return;
      }
    }

    // 初期化
    currentIndex = 0;
    occupiedSeats = [];
    isTeacherView = false; // Reset view mode

    // 設定画面非表示、席替え画面表示
    configScreen.style.display = 'none';
    assignmentScreen.style.display = 'flex'; // Changed to 'flex' to work with new CSS

    // 席替え画面テーブル生成
    generateTable();
    updateInstruction();

    // オートモードの場合、手動ボタンを非表示し、自動実行開始
    if (autoMode) {
      assignButton.style.display = 'none';
      autoTimer = setInterval(() => {
        if (currentIndex < students.length) {
          assignSeat();
        } else {
          clearInterval(autoTimer);
        }
      }, autoInterval * 1000);
    }
  });

  function updateStudentInfoLabel() {
    // auto-number: 自動割り当て、showFurigana:  読み仮名表示
    if (autoNumberCheckbox.checked) {
      if (showFuriganaCheckbox.checked) {
        // 自動割り当てON,  読み仮名ON: 入力は「名前, 読み仮名」
        // document.getElementById('student-info-label').textContent = "生徒情報";
        document.getElementById('explanation').textContent = "※「名前, 読み仮名」を番号順に改行区切りで入力";
        studentInfoTextarea.placeholder = "例：織田,おだ\n　　徳川,とくがわ\n　　豊臣,とよとみ";
      } else {
        // 自動割り当てON,  読み仮名OFF: 入力は「名前」だけ
        // document.getElementById('student-info-label').textContent = "生徒情報";
        document.getElementById('explanation').textContent = "※名前を番号順に改行区切りで入力";
        studentInfoTextarea.placeholder = "例：織田\n　　徳川\n　　豊臣";
      }
    } else {
      if (showFuriganaCheckbox.checked) {
        // 自動割り当てOFF,  読み仮名ON: 入力は「番号, 名前, 読み仮名」
        // document.getElementById('student-info-label').textContent = "生徒情報";
        document.getElementById('explanation').textContent = "※「番号, 名前, 読み仮名」を改行区切りで入力";
        studentInfoTextarea.placeholder = "例：1,織田,おだ\n　　2,徳川,とくがわ\n　　3,豊臣,とよとみ";
      } else {
        // 自動割り当てOFF,  読み仮名OFF: 入力は「番号, 名前」
        // document.getElementById('student-info-label').textContent = "生徒情報";
        document.getElementById('explanation').textContent = "※「番号, 名前」を改行区切りで入力";
        studentInfoTextarea.placeholder = "例：1,織田\n　　2,徳川\n　　3,豊臣";
      }
    }
  }
  autoNumberCheckbox.addEventListener('change', updateStudentInfoLabel);
  showFuriganaCheckbox.addEventListener('change', updateStudentInfoLabel);
  updateStudentInfoLabel();  
  
  // プレビューグリッド生成
  function generatePreviewGrid() {
    const previewRows = parseInt(rowCountSelect.value, 10);
    const previewCols = parseInt(colCountSelect.value, 10);
    previewGridContainer.innerHTML = '';
    const table = document.createElement('table');
    for (let r = 0; r < previewRows; r++) {
      const row = document.createElement('tr');
      for (let c = 0; c < previewCols; c++) {
        const cell = document.createElement('td');
        const btn = document.createElement('button');
        btn.textContent = '';
        btn.setAttribute('data-row', r);
        btn.setAttribute('data-col', c);
        btn.title = "クリックして除外設定"; // Tooltip added
        btn.addEventListener('click', () => {
          if (btn.classList.contains('excluded')) {
            btn.classList.remove('excluded');
            // btn.textContent = ''; // Controlled by CSS
          } else {
            btn.classList.add('excluded');
            // btn.textContent = '✕'; // Controlled by CSS
          }
        });
        cell.appendChild(btn);
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
    previewGridContainer.appendChild(table);
  }

  // 席替え画面のグリッド生成
  function generateTable() {
    seatTable.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      const row = seatTable.insertRow();
      for (let c = 0; c < cols; c++) {
        const cell = row.insertCell();
        if (excludedSeats.some(seat => seat.row === r && seat.col === c)) {
          cell.classList.add('x');
          // cell.textContent = '✕'; // Removed text content to let CSS handle it cleanly
        } else {
          cell.textContent = '';
        }
      }
    }
  }

  function updateInstruction() {
    if (currentIndex < students.length) {
      if (autoMode) {
        instruction.style.display = 'block';
        instruction.innerHTML = `<span style="color:var(--primary-color); font-weight:bold;">${students[currentIndex].name}</span> さんの席を決めています…`;
        assignButton.textContent = "席を決める";
      } else {
        instruction.style.display = 'block'; // Always show instruction
        instruction.innerHTML = `次は <span style="color:var(--primary-color); font-weight:bold;">${students[currentIndex].name}</span> さん`;
        assignButton.textContent = "くじを引く"; // Changed text for better UX
      }
    } else {
      instruction.style.display = 'block';
      instruction.textContent = 'すべての席が決まりました！';
      assignButton.style.display = 'none';
      addPostAssignmentControls();
    }
  }  

  function assignSeat() {
    if (currentIndex >= students.length) return;
    
    let seat;
    do {
      const row = Math.floor(Math.random() * rows);
      const col = Math.floor(Math.random() * cols);
      seat = { row, col };
    } while (
      occupiedSeats.some(s => s.row === seat.row && s.col === seat.col) ||
      excludedSeats.some(s => s.row === seat.row && s.col === seat.col)
    );
    
    let movingCircle;
    // Faster animation for better feel
    const interval = setInterval(() => {
      if (movingCircle) movingCircle.classList.remove('circle');
      
      // アニメーション用候補（空いている席のみ）をリストアップ
      const candidates = [];
      for(let r = 0; r < rows; r++) {
        for(let c = 0; c < cols; c++) {
          // DOM要素からクラスを確認して空き席判定
          // 注意: DOM順序に関わらずrows[r]にアクセスするが、
          // 席決め中はまだTeacherView切替ボタンが出ないため、DOM順はStudentView(標準)のまま
          const cell = seatTable.rows[r].cells[c];
          if (!cell.classList.contains('occupied') && !cell.classList.contains('x')) {
            candidates.push({ r, c });
          }
        }
      }

      if (candidates.length > 0) {
        const cand = candidates[Math.floor(Math.random() * candidates.length)];
        movingCircle = seatTable.rows[cand.r].cells[cand.c];
        movingCircle.classList.add('circle');
      }
      
    }, 150);
    
    // Wait slightly before stopping to show animation
    setTimeout(() => {
        clearInterval(interval);
        if (movingCircle) movingCircle.classList.remove('circle');
        const finalCell = seatTable.rows[seat.row].cells[seat.col];
        finalCell.classList.add('occupied');
        finalCell.textContent = students[currentIndex].name;
        occupiedSeats.push(seat);
        if (lastNewAssignedCell) {
          lastNewAssignedCell.classList.remove('new-assigned');
        }
        finalCell.classList.add('new-assigned');
        lastNewAssignedCell = finalCell;
        
        currentIndex++;
        updateInstruction();
    }, 800); // 800ms delay for the visual effect
  }

  assignButton.addEventListener('click', assignSeat);

  function addPostAssignmentControls() {
    let controlsDiv = document.getElementById('post-assignment-controls');
    if (!controlsDiv) {
      controlsDiv = document.createElement('div');
      controlsDiv.id = 'post-assignment-controls';
      leftPane.appendChild(controlsDiv);
    }
    
    const showResultButton = document.createElement('button');
    showResultButton.id = 'show-result-button';
    showResultButton.textContent = '全体座席表を表示 / 画像保存';
    showResultButton.classList.add('assign-button');
    showResultButton.addEventListener('click', () => {
      displayFullscreen();
    });
    
    const toggleViewButton = document.createElement('button');
    toggleViewButton.textContent = '教師から見た配置に変更';
    toggleViewButton.classList.add('assign-button');
    toggleViewButton.style.borderColor = 'var(--primary-color)';
    toggleViewButton.style.color = 'var(--primary-color)';
    toggleViewButton.style.marginBottom = '10px';
    toggleViewButton.addEventListener('click', () => {
      toggleViewMode();
      toggleViewButton.textContent = isTeacherView ? '生徒から見た配置に変更' : '教師から見た配置に変更';
    });
    
    const swapSeatButton = document.createElement('button');
    swapSeatButton.id = 'swap-seat-button';
    swapSeatButton.textContent = '席を入れ替える';
    swapSeatButton.classList.add('assign-button');
    swapSeatButton.style.borderColor = 'var(--secondary-color)';
    swapSeatButton.style.color = 'var(--secondary-color)';

    swapSeatButton.addEventListener('click', () => {
      swapSeatButton.style.display = 'none';
      showSwapControls();
      if (lastNewAssignedCell) {
        lastNewAssignedCell.classList.remove('new-assigned');
      }
    });
    
    controlsDiv.appendChild(showResultButton);
    controlsDiv.appendChild(toggleViewButton);
    controlsDiv.appendChild(swapSeatButton);
  }

  function toggleViewMode() {
    isTeacherView = !isTeacherView;
    const stage = document.querySelector('.stage-container');
    const blackboard = document.querySelector('.blackboard');
    const table = document.getElementById('seat-table');
    
    // DOM上の行の並び順を反転させる
    // insertBeforeは要素を移動させるため、後ろから順に追加していくことで反転できる
    const rowsArr = Array.from(table.rows);
    for (let i = rowsArr.length - 1; i >= 0; i--) {
        table.appendChild(rowsArr[i]);
    }

    // 黒板の位置を変更
    if (isTeacherView) {
        // 教師視点: 黒板を下に移動（コンテナの最後に追加）
        stage.appendChild(blackboard);
        stage.appendChild(blackboard);
        blackboard.style.marginTop = '2rem';
        blackboard.style.marginBottom = '0';
    } else {
        // 生徒視点: 黒板を上に移動（テーブルの前に挿入）
        stage.insertBefore(blackboard, table);
        blackboard.style.marginTop = '0';
        blackboard.style.marginBottom = '2rem';
    }
  }
  
  function showSwapControls() {
    let controlsDiv = document.getElementById('post-assignment-controls');
    
    const input1 = document.createElement('input');
    input1.type = 'number';
    input1.id = 'swap-input-1';
    input1.placeholder = '入れ替える人の番号（1人目）';
    
    const input2 = document.createElement('input');
    input2.type = 'number';
    input2.id = 'swap-input-2';
    input2.placeholder = '入れ替える人の番号（2人目）';
    
    const confirmSwapButton = document.createElement('button');
    confirmSwapButton.id = 'confirm-swap-button';
    confirmSwapButton.textContent = '決定';
    confirmSwapButton.classList.add('assign-button');
    confirmSwapButton.addEventListener('click', () => {
      const num1 = parseInt(input1.value);
      const num2 = parseInt(input2.value);
      if (isNaN(num1) || isNaN(num2)) {
        alert('両方の番号を入力してください。');
        return;
      }
      performSwap(num1, num2);
      input1.remove();
      input2.remove();
      confirmSwapButton.remove();
      const swapSeatButton = document.getElementById('swap-seat-button');
      swapSeatButton.style.display = 'block';
    });
    
    controlsDiv.appendChild(input1);
    controlsDiv.appendChild(input2);
    controlsDiv.appendChild(confirmSwapButton);
  }
  
  function performSwap(num1, num2) {
    const index1 = students.findIndex(s => s.number === num1);
    const index2 = students.findIndex(s => s.number === num2);
    if (index1 === -1 || index2 === -1) {
      alert('入力された番号の学生が見つかりません。');
      return;
    }
    const seatA = occupiedSeats[index1];
    const seatB = occupiedSeats[index2];
    if (!seatA || !seatB) {
      alert('指定された学生は席に割り当てられていません。');
      return;
    }
    const originalSeatA = { ...seatA };
    const originalSeatB = { ...seatB };
    occupiedSeats[index1] = seatB;
    occupiedSeats[index2] = seatA;
    
    // DOM上の行インデックスを計算（TeacherViewの場合は反転しているため補正）
    let rowIndexA = originalSeatB.row; // seatBの行にstudent1(index1)を入れる
    let rowIndexB = originalSeatA.row; // seatAの行にstudent2(index2)を入れる

    if (isTeacherView) {
        // DOMが反転している場合、論理行0はDOMの末尾(rows-1)になる
        rowIndexA = (rows - 1) - rowIndexA;
        rowIndexB = (rows - 1) - rowIndexB;
    }

    const cellForStudent1 = seatTable.rows[rowIndexA].cells[originalSeatB.col];
    cellForStudent1.textContent = students[index1].name;
    cellForStudent1.classList.add('occupied');
    
    const cellForStudent2 = seatTable.rows[rowIndexB].cells[originalSeatA.col];
    cellForStudent2.textContent = students[index2].name;
    cellForStudent2.classList.add('occupied');
  }
  
  function displayFullscreen() {
    const fullscreenDiv = document.createElement('div');
    fullscreenDiv.classList.add('fullscreen');
    
    const captureContainer = document.createElement('div');
    captureContainer.style.backgroundColor = 'white';
    captureContainer.style.padding = '40px';
    captureContainer.style.borderRadius = '8px';
    captureContainer.style.display = 'flex'; // Flex column for layout
    captureContainer.style.flexDirection = 'column';
    captureContainer.style.alignItems = 'center';
    
    // 黒板要素の作成
    const blackboardDiv = document.createElement('div');
    blackboardDiv.textContent = "黒板 / 教卓";
    blackboardDiv.style.width = "80%";
    blackboardDiv.style.backgroundColor = "#374151";
    blackboardDiv.style.color = "#E5E7EB";
    blackboardDiv.style.textAlign = "center";
    blackboardDiv.style.padding = "0.5rem";
    blackboardDiv.style.borderRadius = "4px";
    blackboardDiv.style.letterSpacing = "2px";
    // ビューに応じたマージン
    blackboardDiv.style.marginBottom = isTeacherView ? "0" : "2rem";
    blackboardDiv.style.marginTop = isTeacherView ? "2rem" : "0";

    const fullscreenTable = document.createElement('table');
    fullscreenTable.id = 'seat-table';
    fullscreenTable.style.borderCollapse = 'separate'; 
    fullscreenTable.style.borderSpacing = '10px';
    
    for (let r = 0; r < rows; r++) {
      // 教師視点の場合、最前列(r=0)を下に表示したい。
      // 標準のappendRowは上から順に追加するので、
      // 教師視点の場合は insertRow(0) で常に先頭に追加していけば、
      // 0->先頭, 1->先頭(0は2番目へ)... となり、最終的に r=rows-1 が先頭、r=0 が末尾になる
      const row = fullscreenTable.insertRow(isTeacherView ? 0 : -1);
      for (let c = 0; c < cols; c++) {
        const cell = row.insertCell();
        cell.style.boxShadow = "none";
        if (excludedSeats.some(seat => seat.row === r && seat.col === c)) {
          cell.style.border = "none"; 
          cell.style.background = "transparent";
        } else {
          const occupied = occupiedSeats.find(s => s.row === r && s.col === c);
          if (occupied) {
            const studentIndex = occupiedSeats.indexOf(occupied);
            const student = students[studentIndex];
            cell.style.border = "2px solid #1F2937";
            cell.style.borderRadius = "8px";
            cell.style.padding = "10px";
            cell.style.textAlign = "center";
            cell.style.verticalAlign = "middle";
            cell.style.width = "140px";
            cell.style.height = "100px";
            cell.style.backgroundColor = "#fff";

            if (showFuriganaCheckbox.checked && student.reading) {
              cell.innerHTML = `
                <div style="font-size: 0.7rem; color: #4B5563; margin-bottom: 4px;">${student.reading}</div>
                <div style="font-size: 1.4rem; font-weight: 600; color: #1F2937;">
                  <span style="font-size: 1rem; margin-right: 4px;">${student.number}.</span>${student.name}
                </div>
              `;
            } else {
              cell.innerHTML = `
                <div style="font-size: 1.4rem; font-weight: 600; color: #1F2937;">
                  <span style="font-size: 1rem; margin-right: 4px;">${student.number}.</span>${student.name}
                </div>
              `;
            }            
          } else {
             cell.style.border = "2px dashed #CBD5E1";
             cell.style.borderRadius = "8px";
          }
        }
      }
    }
    
    // 要素の追加順序制御
    if (isTeacherView) {
        captureContainer.appendChild(fullscreenTable);
        captureContainer.appendChild(blackboardDiv);
    } else {
        captureContainer.appendChild(blackboardDiv);
        captureContainer.appendChild(fullscreenTable);
    }
    
    fullscreenDiv.appendChild(captureContainer);
    
    const saveButton = document.createElement('button');
    saveButton.textContent = '画像を保存して閉じる';
    fullscreenDiv.appendChild(saveButton);
    
    document.body.appendChild(fullscreenDiv);
    
    saveButton.addEventListener('click', () => {
      saveButton.style.display = 'none';
      
      html2canvas(captureContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'seating-chart.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        document.body.removeChild(fullscreenDiv);
      }).catch(err => {
        console.error(err);
        alert('画像の保存に失敗しました');
        saveButton.style.display = 'block';
      });
    });
  }
});