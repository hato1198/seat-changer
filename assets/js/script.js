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
  let isAnimating = false; // アニメーション実行中フラグ

  // 入れ替えモード用変数
  let isSwapMode = false;
  let swapSelection = null; // 最初に選択された席 {row, col}

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
    isAnimating = false;
    isSwapMode = false;

    // 設定画面非表示、席替え画面表示
    configScreen.style.display = 'none';
    assignmentScreen.style.display = 'flex'; // Changed to 'flex' to work with new CSS

    // 席替え画面テーブル生成
    generateTable();
    updateInstruction();

    // オートモードの場合、手動ボタンを非表示し、自動実行開始
    if (autoMode) {
      assignButton.style.display = 'none';
      assignSeat(); // 初回実行
    }
  });

  function updateStudentInfoLabel() {
    // auto-number: 自動割り当て、showFurigana:  読み仮名表示
    if (autoNumberCheckbox.checked) {
      if (showFuriganaCheckbox.checked) {
        // 自動割り当てON,  読み仮名ON: 入力は「名前, 読み仮名」
        document.getElementById('explanation').textContent = "※「名前, 読み仮名」を番号順に改行区切りで入力";
        studentInfoTextarea.placeholder = "例：織田,おだ\n　　徳川,とくがわ\n　　豊臣,とよとみ";
      } else {
        // 自動割り当てON,  読み仮名OFF: 入力は「名前」だけ
        document.getElementById('explanation').textContent = "※名前を番号順に改行区切りで入力";
        studentInfoTextarea.placeholder = "例：織田\n　　徳川\n　　豊臣";
      }
    } else {
      if (showFuriganaCheckbox.checked) {
        // 自動割り当てOFF,  読み仮名ON: 入力は「番号, 名前, 読み仮名」
        document.getElementById('explanation').textContent = "※「番号, 名前, 読み仮名」を改行区切りで入力";
        studentInfoTextarea.placeholder = "例：1,織田,おだ\n　　2,徳川,とくがわ\n　　3,豊臣,とよとみ";
      } else {
        // 自動割り当てOFF,  読み仮名OFF: 入力は「番号, 名前」
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
          } else {
            btn.classList.add('excluded');
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
        // データの位置特定用に属性を付与
        cell.setAttribute('data-r', r);
        cell.setAttribute('data-c', c);
        cell.addEventListener('click', () => handleCellClick(cell)); // Click handler for swap

        if (excludedSeats.some(seat => seat.row === r && seat.col === c)) {
          cell.classList.add('x');
        } else {
          cell.textContent = '';
        }
      }
    }
  }

  function updateInstruction() {
    // リセット用にマージンを元に戻す（完了状態から戻ることは現状ないが念のため）
    instruction.style.marginBottom = '';

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
      // 完了時はボタンが消えるため、バランス調整で下のマージンをなくす
      instruction.style.marginBottom = '0';
      assignButton.style.display = 'none';
      addPostAssignmentControls();
    }
  }  

  function assignSeat() {
    if (isAnimating) return; // アニメーション中は処理しない
    if (currentIndex >= students.length) return;
    
    isAnimating = true; // アニメーション開始ロック
    assignButton.disabled = true; // ボタン無効化

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
    const interval = setInterval(() => {
      if (movingCircle) movingCircle.classList.remove('circle');
      
      // アニメーション用候補（空いている席のみ）をリストアップ
      const candidates = [];
      for(let r = 0; r < rows; r++) {
        for(let c = 0; c < cols; c++) {
          // DOM要素からクラスを確認して空き席判定
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

        // アニメーション終了処理
        isAnimating = false;
        assignButton.disabled = false;

        // オートモードの場合は、アニメーション終了後に次の実行をスケジュール
        if (autoMode && currentIndex < students.length) {
          autoTimer = setTimeout(assignSeat, autoInterval * 1000);
        }
    }, 800);
  }

  assignButton.addEventListener('click', assignSeat);

  function addPostAssignmentControls() {
    let controlsDiv = document.getElementById('post-assignment-controls');
    if (!controlsDiv) {
      controlsDiv = document.createElement('div');
      controlsDiv.id = 'post-assignment-controls';
      leftPane.appendChild(controlsDiv);
    } else {
      controlsDiv.innerHTML = ''; // Clear existing controls if any
    }
    
    const showResultButton = document.createElement('button');
    showResultButton.id = 'show-result-button';
    showResultButton.textContent = '全体座席表を表示 / 画像保存';
    showResultButton.classList.add('assign-button');
    showResultButton.addEventListener('click', () => {
      displayFullscreen();
    });
    
    const toggleViewButton = document.createElement('button');
    toggleViewButton.textContent = isTeacherView ? '生徒から見た配置に変更' : '教師から見た配置に変更';
    toggleViewButton.classList.add('assign-button');
    toggleViewButton.style.borderColor = 'var(--secondary-color)';
    toggleViewButton.style.color = 'var(--secondary-color)';
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
      enableSwapMode();
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
    const rowsArr = Array.from(table.rows);
    for (let i = rowsArr.length - 1; i >= 0; i--) {
        table.appendChild(rowsArr[i]);
    }

    // 黒板の位置を変更
    if (isTeacherView) {
        stage.appendChild(blackboard);
        stage.appendChild(blackboard);
        blackboard.style.marginTop = '2rem';
        blackboard.style.marginBottom = '0';
    } else {
        stage.insertBefore(blackboard, table);
        blackboard.style.marginTop = '0';
        blackboard.style.marginBottom = '2rem';
    }
  }

  // --- Swap Mode Logic ---

  function enableSwapMode() {
    isSwapMode = true;
    swapSelection = null;
    seatTable.classList.add('swap-mode');
    
    // Clear "New Assigned" highlight for cleaner look
    if (lastNewAssignedCell) {
        lastNewAssignedCell.classList.remove('new-assigned');
    }

    // Update Left Pane UI
    const controlsDiv = document.getElementById('post-assignment-controls');
    // 既存のボタンを一時保存（DOMから削除はしないが非表示に）
    Array.from(controlsDiv.children).forEach(child => child.style.display = 'none');

    // Instructionを更新
    instruction.innerHTML = '入れ替える人の <span style="color:var(--primary-color); font-weight:bold;">1人目</span> を選んでください';
    instruction.style.marginBottom = '';

    const cancelButton = document.createElement('button');
    cancelButton.id = 'cancel-swap-button';
    cancelButton.textContent = '入れ替えをキャンセル';
    cancelButton.classList.add('assign-button');
    cancelButton.style.backgroundColor = 'var(--secondary-color)';
    cancelButton.style.color = 'white';
    cancelButton.onclick = disableSwapMode;
    controlsDiv.appendChild(cancelButton);
  }

  function disableSwapMode() {
    isSwapMode = false;
    swapSelection = null;
    seatTable.classList.remove('swap-mode');

    // 選択ハイライト解除
    seatTable.querySelectorAll('.selected-swap').forEach(cell => cell.classList.remove('selected-swap'));

    // Left Pane UI復元
    const controlsDiv = document.getElementById('post-assignment-controls');
    const cancelButton = document.getElementById('cancel-swap-button');
    if (cancelButton) cancelButton.remove();

    Array.from(controlsDiv.children).forEach(child => child.style.display = 'block');
    instruction.textContent = 'すべての席が決まりました！';
    instruction.style.marginBottom = '0';
  }

  function handleCellClick(cell) {
    if (!isSwapMode || isAnimating) return;

    // 空席や除外席はクリックできない（入れ替え対象外）
    if (!cell.classList.contains('occupied')) return;

    // データの位置を取得（TeacherViewでも属性は変わらない）
    const r = parseInt(cell.getAttribute('data-r'), 10);
    const c = parseInt(cell.getAttribute('data-c'), 10);

    // セルの表示名を取得
    const studentName = cell.textContent;

    if (!swapSelection) {
        // 1つ目の選択
        swapSelection = { row: r, col: c, cell: cell };
        cell.classList.add('selected-swap');
        instruction.innerHTML = `<span style="color:var(--primary-color); font-weight:bold;">${studentName}</span> さんと入れ替える人を選んでください`;
    } else {
        // 同じ席をクリックしたら選択解除
        if (swapSelection.row === r && swapSelection.col === c) {
            cell.classList.remove('selected-swap');
            swapSelection = null;
            instruction.innerHTML = '入れ替える人の <span style="color:var(--primary-color); font-weight:bold;">1人目</span> を選んでください';
            return;
        }

        // 2つ目の選択 -> 入れ替え実行
        cell.classList.add('selected-swap');
        executeSwap(swapSelection, { row: r, col: c, cell: cell });
    }
  }

  function executeSwap(seat1, seat2) {
    isAnimating = true;
    instruction.textContent = '席を入れ替えています...';
    
    // アニメーション用クラス付与
    seat1.cell.classList.add('swapping');
    seat2.cell.classList.add('swapping');

    // データ更新の準備
    // occupiedSeatsからそれぞれの席データを探す
    const index1 = occupiedSeats.findIndex(s => s.row === seat1.row && s.col === seat1.col);
    const index2 = occupiedSeats.findIndex(s => s.row === seat2.row && s.col === seat2.col);

    // 0.4秒後に内容を入れ替えてアニメーション終了
    setTimeout(() => {
        // DOMのテキスト交換
        const tempText = seat1.cell.textContent;
        seat1.cell.textContent = seat2.cell.textContent;
        seat2.cell.textContent = tempText;

        // occupiedSeats配列内の位置情報の交換（学生データは配列インデックスと紐づいているため、配列の中身を入れ替えるのではなく、座席情報を入れ替える）
        // occupiedSeats[i] は i番目の学生の座席情報 {row, col}
        // 単純に、DOM上の表示を変えたので、occupiedSeats内の対応を入れ替える必要がある。
        // 学生A (index1の席) が Seat2に行き、学生B (index2の席) が Seat1に行く。
        if (index1 !== -1) occupiedSeats[index1] = { row: seat2.row, col: seat2.col };
        if (index2 !== -1) occupiedSeats[index2] = { row: seat1.row, col: seat1.col };

        // クラス解除
        seat1.cell.classList.remove('swapping', 'selected-swap');
        seat2.cell.classList.remove('swapping', 'selected-swap');

        isAnimating = false;
        disableSwapMode();
    }, 400);
  }
  
  // --- Fullscreen & Export ---

  function displayFullscreen() {
    const fullscreenDiv = document.createElement('div');
    fullscreenDiv.classList.add('fullscreen');
    
    const captureContainer = document.createElement('div');
    captureContainer.style.backgroundColor = 'white';
    captureContainer.style.padding = '40px';
    captureContainer.style.borderRadius = '8px';
    captureContainer.style.display = 'flex';
    captureContainer.style.flexDirection = 'column';
    captureContainer.style.alignItems = 'center';
    
    // 黒板要素
    const blackboardDiv = document.createElement('div');
    blackboardDiv.textContent = "黒板 / 教卓";
    blackboardDiv.style.width = "80%";
    blackboardDiv.style.backgroundColor = "#374151";
    blackboardDiv.style.color = "#E5E7EB";
    blackboardDiv.style.textAlign = "center";
    blackboardDiv.style.padding = "0.5rem";
    blackboardDiv.style.borderRadius = "4px";
    blackboardDiv.style.letterSpacing = "2px";
    blackboardDiv.style.marginBottom = isTeacherView ? "0" : "2rem";
    blackboardDiv.style.marginTop = isTeacherView ? "2rem" : "0";

    const fullscreenTable = document.createElement('table');
    fullscreenTable.id = 'seat-table';
    fullscreenTable.style.borderCollapse = 'separate'; 
    fullscreenTable.style.borderSpacing = '10px';
    
    for (let r = 0; r < rows; r++) {
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
    
    if (isTeacherView) {
        captureContainer.appendChild(fullscreenTable);
        captureContainer.appendChild(blackboardDiv);
    } else {
        captureContainer.appendChild(blackboardDiv);
        captureContainer.appendChild(fullscreenTable);
    }
    
    fullscreenDiv.appendChild(captureContainer);
    
    // アクションボタンエリア
    const actionDiv = document.createElement('div');
    actionDiv.className = 'fullscreen-actions';

    const closeButton = document.createElement('button');
    closeButton.textContent = '閉じる';
    closeButton.className = 'fullscreen-close-btn';
    closeButton.addEventListener('click', () => {
        document.body.removeChild(fullscreenDiv);
    });

    const saveButton = document.createElement('button');
    saveButton.textContent = '画像を保存';
    saveButton.className = 'fullscreen-save-btn';
    saveButton.addEventListener('click', () => {
      // ボタン類を隠す必要はない（captureContainer外にあるため）
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
      }).catch(err => {
        console.error(err);
        alert('画像の保存に失敗しました');
      });
    });

    actionDiv.appendChild(closeButton);
    actionDiv.appendChild(saveButton);
    fullscreenDiv.appendChild(actionDiv);
    
    document.body.appendChild(fullscreenDiv);
  }
});