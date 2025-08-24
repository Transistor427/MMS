// Основной класс для управления принтерами
class PrinterManager {
    constructor() {
        this.printers = [];
        this.selectedPrinters = new Set();
        this.currentView = 'grid';
        this.statusFilter = 'all';
        this.updateInterval = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadPrinters();
        this.startStatusUpdates();
        this.updateCounters();
    }

    setupEventListeners() {
        // Навигация
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.setActiveNavItem(item);
                this.switchPanel(item.dataset.section);
            });
        });

        // Статусные вкладки
        document.querySelectorAll('.status-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.setActiveStatusTab(tab);
            });
        });

        // Кнопки действий
        document.getElementById('add-printer-btn').addEventListener('click', () => {
            this.showModal('add-printer-modal');
        });

        document.getElementById('edit-tags-btn').addEventListener('click', () => {
            this.showEditTagsModal();
        });

        // Переключение вида
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveView(e.target.closest('.view-btn').dataset.view);
            });
        });

        // Выбор всех
        document.getElementById('select-all').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        // Массовые действия
        document.getElementById('bulk-action-btn').addEventListener('click', () => {
            this.showBulkActionsMenu();
        });

        // Фильтры
        document.getElementById('status-filter').addEventListener('change', (e) => {
            this.applyFilters();
        });

        // Модальные окна
        this.setupModalEvents();

        // Обработчики для новых панелей
        this.setupPanelEventListeners();
    }

    setupModalEvents() {
        // Добавление принтера
        document.getElementById('save-printer').addEventListener('click', () => {
            this.addPrinter();
        });

        document.getElementById('cancel-add-printer').addEventListener('click', () => {
            this.hideModal('add-printer-modal');
        });

        // Загрузка файла
        document.getElementById('upload-file').addEventListener('click', () => {
            this.uploadFile();
        });

        document.getElementById('cancel-upload').addEventListener('click', () => {
            this.hideModal('upload-file-modal');
        });

        // Запуск печати
        document.getElementById('start-print').addEventListener('click', () => {
            this.startPrint();
        });

        document.getElementById('cancel-start-print').addEventListener('click', () => {
            this.hideModal('start-print-modal');
        });

        // Закрытие модальных окон
        document.querySelectorAll('.modal-close').forEach(close => {
            close.addEventListener('click', (e) => {
                this.hideModal(e.target.closest('.modal').id);
            });
        });

        // Закрытие по клику вне модального окна
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    async loadPrinters() {
        try {
            const response = await fetch('/api/printers');
            this.printers = await response.json();
            this.renderPrinters();
        } catch (error) {
            console.error('Ошибка загрузки принтеров:', error);
            this.showNotification('Ошибка загрузки принтеров', 'error');
        }
    }

    async addPrinter() {
        const name = document.getElementById('printer-name').value;
        const ip = document.getElementById('printer-ip').value;
        const port = document.getElementById('printer-port').value;
        const tags = document.getElementById('printer-tags').value;

        if (!name || !ip) {
            this.showNotification('Заполните обязательные поля', 'error');
            return;
        }

        try {
            const response = await fetch('/api/printers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    ip_address: ip,
                    port: parseInt(port) || 7125,
                    tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag)
                })
            });

            if (response.ok) {
                const printer = await response.json();
                this.printers.push(printer);
                this.renderPrinters();
                this.hideModal('add-printer-modal');
                this.showNotification('Принтер добавлен успешно', 'success');
                
                // Очистка формы
                document.getElementById('add-printer-form').reset();
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Ошибка добавления принтера', 'error');
            }
        } catch (error) {
            console.error('Ошибка добавления принтера:', error);
            this.showNotification('Ошибка добавления принтера', 'error');
        }
    }

    async removePrinter(printerId) {
        if (!confirm('Вы уверены, что хотите удалить этот принтер?')) {
            return;
        }

        try {
            const response = await fetch(`/api/printers/${printerId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.printers = this.printers.filter(p => p.id !== printerId);
                this.renderPrinters();
                this.showNotification('Принтер удален успешно', 'success');
            } else {
                this.showNotification('Ошибка удаления принтера', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления принтера:', error);
            this.showNotification('Ошибка удаления принтера', 'error');
        }
    }

    async getPrinterStatus(printerId) {
        try {
            const response = await fetch(`/api/printers/${printerId}/status`);
            return await response.json();
        } catch (error) {
            console.error('Ошибка получения статуса принтера:', error);
            return { online: false, error: error.message };
        }
    }

    async startStatusUpdates() {
        // Обновление статуса каждые 5 секунд
        this.updateInterval = setInterval(async () => {
            for (const printer of this.printers) {
                const status = await this.getPrinterStatus(printer.id);
                printer.status = status;
                this.updatePrinterCard(printer);
            }
            this.updateCounters();
        }, 5000);
    }

    renderPrinters() {
        const container = document.getElementById('printers-container');
        container.innerHTML = '';

        const filteredPrinters = this.getFilteredPrinters();

        filteredPrinters.forEach(printer => {
            const card = this.createPrinterCard(printer);
            container.appendChild(card);
        });

        this.updateCounters();
    }

    createPrinterCard(printer) {
        const card = document.createElement('div');
        card.className = 'printer-card';
        card.dataset.printerId = printer.id;

        const status = printer.status || { online: false };
        const printStats = status.print_stats || {};
        const temperature = status.temperature || {};

        // Определение статуса принтера
        let printerStatus = 'offline';
        let statusClass = 'status-offline';
        
        if (status.online) {
            if (printStats.state === 'printing') {
                printerStatus = 'printing';
                statusClass = 'status-printing';
            } else if (printStats.state === 'paused') {
                printerStatus = 'paused';
                statusClass = 'status-paused';
            } else if (printStats.state === 'complete') {
                printerStatus = 'completed';
                statusClass = 'status-completed';
            } else {
                printerStatus = 'idle';
                statusClass = 'status-idle';
            }
        }

        // Добавление классов для анимации
        if (printStats.state === 'error') {
            card.classList.add('error');
        } else if (printStats.state === 'complete') {
            card.classList.add('completed');
        }

        // Обработчик клика для остановки анимации
        card.addEventListener('click', () => {
            card.classList.remove('error', 'completed');
        });

        card.innerHTML = `
            <div class="printer-header">
                <div class="printer-info">
                    <h3>${printer.name}</h3>
                    <small>${printer.id}</small>
                </div>
                <div class="printer-controls">
                    <input type="checkbox" class="printer-select" data-printer-id="${printer.id}">
                    <span class="printer-status ${statusClass}">${this.getStatusText(printerStatus)}</span>
                </div>
            </div>
            
            <div class="printer-webcam">
                ${status.online ? 
                    `<img src="${printer.webcam_url}" alt="Веб-камера ${printer.name}" onerror="this.parentElement.innerHTML='<div class=\\'no-image\\'>Нет изображения</div>'">` :
                    '<div class="no-image">Принтер недоступен</div>'
                }
            </div>
            
            <div class="printer-details">
                ${this.renderPrintInfo(printStats, printer)}
            </div>
            
            <div class="printer-actions">
                <button class="action-btn btn-primary" onclick="printerManager.showPrinterDetails('${printer.id}')">
                    <i class="fas fa-info-circle"></i> Подробнее
                </button>
                ${this.renderActionButtons(printer, printStats)}
            </div>
        `;

        // Обработчики событий для карточки
        this.setupCardEventListeners(card, printer);

        return card;
    }

    renderPrintInfo(printStats, printer) {
        if (!printStats.filename) {
            return '<div class="print-info"><div class="no-print">Нет активной печати</div></div>';
        }

        const progress = printStats.progress || 0;
        const timeLeft = this.formatTime(printStats.print_duration || 0);
        const layers = `${printStats.info?.current_layer || 0}/${printStats.info?.total_layer || 0}`;

        return `
            <div class="print-info">
                <div class="print-preview">
                    <i class="fas fa-cube"></i>
                </div>
                <div class="print-details">
                    <div class="print-filename">${printStats.filename}</div>
                    <div class="print-progress">
                        <span>${Math.round(progress * 100)}%</span>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress * 100}%"></div>
                        </div>
                        <span>- ${timeLeft}</span>
                    </div>
                    <div class="print-stats">
                        <span>Слои: ${layers}</span>
                        <span>${new Date().toLocaleString()}</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderActionButtons(printer, printStats) {
        const buttons = [];

        if (printStats.state === 'printing') {
            buttons.push(`
                <button class="action-btn btn-warning" onclick="printerManager.pausePrint('${printer.id}')">
                    <i class="fas fa-pause"></i> Пауза
                </button>
                <button class="action-btn btn-danger" onclick="printerManager.cancelPrint('${printer.id}')">
                    <i class="fas fa-stop"></i> Стоп
                </button>
            `);
        } else if (printStats.state === 'paused') {
            buttons.push(`
                <button class="action-btn btn-primary" onclick="printerManager.resumePrint('${printer.id}')">
                    <i class="fas fa-play"></i> Возобновить
                </button>
                <button class="action-btn btn-danger" onclick="printerManager.cancelPrint('${printer.id}')">
                    <i class="fas fa-stop"></i> Стоп
                </button>
            `);
        } else {
            buttons.push(`
                <button class="action-btn btn-primary" onclick="printerManager.showStartPrintModal('${printer.id}')">
                    <i class="fas fa-play"></i> Запустить
                </button>
            `);
        }

        buttons.push(`
            <button class="action-btn btn-secondary" onclick="printerManager.toggleLight('${printer.id}')">
                <i class="fas fa-lightbulb"></i> Подсветка
            </button>
        `);

        // Добавляем кнопку удаления
        buttons.push(`
            <button class="action-btn btn-danger" onclick="printerManager.deletePrinter('${printer.id}')" title="Удалить принтер">
                <i class="fas fa-trash"></i>
            </button>
        `);

        return buttons.join('');
    }

    setupCardEventListeners(card, printer) {
        // Выбор принтера
        const checkbox = card.querySelector('.printer-select');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectedPrinters.add(printer.id);
            } else {
                this.selectedPrinters.delete(printer.id);
            }
            this.updateSelectedCount();
        });
    }

    async pausePrint(printerId) {
        try {
            const response = await fetch(`/api/printers/${printerId}/print/pause`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('Печать приостановлена', 'success');
                await this.refreshPrinterStatus(printerId);
            } else {
                this.showNotification('Ошибка приостановки печати', 'error');
            }
        } catch (error) {
            console.error('Ошибка приостановки печати:', error);
            this.showNotification('Ошибка приостановки печати', 'error');
        }
    }

    async resumePrint(printerId) {
        try {
            const response = await fetch(`/api/printers/${printerId}/print/resume`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('Печать возобновлена', 'success');
                await this.refreshPrinterStatus(printerId);
            } else {
                this.showNotification('Ошибка возобновления печати', 'error');
            }
        } catch (error) {
            console.error('Ошибка возобновления печати:', error);
            this.showNotification('Ошибка возобновления печати', 'error');
        }
    }

    async cancelPrint(printerId) {
        if (!confirm('Вы уверены, что хотите отменить печать?')) {
            return;
        }

        try {
            const response = await fetch(`/api/printers/${printerId}/print/cancel`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.showNotification('Печать отменена', 'success');
                await this.refreshPrinterStatus(printerId);
            } else {
                this.showNotification('Ошибка отмены печати', 'error');
            }
        } catch (error) {
            console.error('Ошибка отмены печати:', error);
            this.showNotification('Ошибка отмены печати', 'error');
        }
    }

    async toggleLight(printerId) {
        try {
            const response = await fetch(`/api/printers/${printerId}/light/toggle`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification(
                    result.state > 0 ? 'Подсветка включена' : 'Подсветка выключена', 
                    'success'
                );
            } else {
                this.showNotification('Ошибка переключения подсветки', 'error');
            }
        } catch (error) {
            console.error('Ошибка переключения подсветки:', error);
            this.showNotification('Ошибка переключения подсветки', 'error');
        }
    }

    async deletePrinter(printerId) {
        const printer = this.printers.find(p => p.id === printerId);
        if (!printer) return;

        if (!confirm(`Вы уверены, что хотите удалить принтер "${printer.name}"? Это действие нельзя отменить.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/printers/${printerId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showNotification(`Принтер "${printer.name}" удален`, 'success');
                // Удаляем принтер из списка
                this.printers = this.printers.filter(p => p.id !== printerId);
                this.selectedPrinters.delete(printerId);
                this.renderPrinters();
                this.updateCounters();
            } else {
                this.showNotification('Ошибка удаления принтера', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления принтера:', error);
            this.showNotification('Ошибка удаления принтера', 'error');
        }
    }

    showBulkActionsMenu() {
        const selectedCount = this.selectedPrinters.size;
        if (selectedCount === 0) return;

        const actions = [
            {
                label: `Удалить выбранные (${selectedCount})`,
                action: () => this.bulkDeletePrinters(),
                icon: 'fas fa-trash',
                class: 'danger'
            }
        ];

        // Создаем выпадающее меню
        const menu = document.createElement('div');
        menu.className = 'bulk-actions-menu';
        menu.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            background: white;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            z-index: 1000;
            min-width: 200px;
        `;

        actions.forEach(action => {
            const item = document.createElement('div');
            item.className = `bulk-action-item ${action.class || ''}`;
            item.style.cssText = `
                padding: 10px 15px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                border-bottom: 1px solid #eee;
            `;
            item.innerHTML = `
                <i class="${action.icon}"></i>
                <span>${action.label}</span>
            `;
            item.addEventListener('click', () => {
                action.action();
                document.body.removeChild(menu);
            });
            menu.appendChild(item);
        });

        // Добавляем меню на страницу
        const button = document.getElementById('bulk-action-btn');
        const rect = button.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
        
        document.body.appendChild(menu);

        // Закрытие по клику вне меню
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && !button.contains(e.target)) {
                    document.body.removeChild(menu);
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }

    async bulkDeletePrinters() {
        const selectedPrinters = Array.from(this.selectedPrinters);
        const printerNames = selectedPrinters.map(id => {
            const printer = this.printers.find(p => p.id === id);
            return printer ? printer.name : id;
        });

        if (!confirm(`Вы уверены, что хотите удалить следующие принтеры?\n\n${printerNames.join('\n')}\n\nЭто действие нельзя отменить.`)) {
            return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (const printerId of selectedPrinters) {
            try {
                const response = await fetch(`/api/printers/${printerId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Ошибка удаления принтера ${printerId}:`, error);
                errorCount++;
            }
        }

        // Обновляем список принтеров
        this.printers = this.printers.filter(p => !this.selectedPrinters.has(p.id));
        this.selectedPrinters.clear();
        this.renderPrinters();
        this.updateCounters();

        // Показываем результат
        if (successCount > 0) {
            this.showNotification(`Удалено принтеров: ${successCount}`, 'success');
        }
        if (errorCount > 0) {
            this.showNotification(`Ошибок при удалении: ${errorCount}`, 'error');
        }
    }

    async showStartPrintModal(printerId) {
        try {
            const response = await fetch(`/api/printers/${printerId}/files`);
            const files = await response.json();
            
            const select = document.getElementById('print-file');
            select.innerHTML = '<option value="">Выберите файл</option>';
            
            files.forEach(file => {
                if (file.pathname.endsWith('.gcode') || file.pathname.endsWith('.3mf')) {
                    const option = document.createElement('option');
                    option.value = file.pathname;
                    option.textContent = file.pathname.split('/').pop();
                    select.appendChild(option);
                }
            });
            
            document.getElementById('start-print').onclick = () => this.startPrint(printerId);
            this.showModal('start-print-modal');
        } catch (error) {
            console.error('Ошибка загрузки файлов:', error);
            this.showNotification('Ошибка загрузки файлов', 'error');
        }
    }

    async startPrint(printerId) {
        const filename = document.getElementById('print-file').value;
        if (!filename) {
            this.showNotification('Выберите файл для печати', 'error');
            return;
        }

        try {
            const response = await fetch(`/api/printers/${printerId}/print/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename })
            });
            
            if (response.ok) {
                this.showNotification('Печать запущена', 'success');
                this.hideModal('start-print-modal');
                await this.refreshPrinterStatus(printerId);
            } else {
                this.showNotification('Ошибка запуска печати', 'error');
            }
        } catch (error) {
            console.error('Ошибка запуска печати:', error);
            this.showNotification('Ошибка запуска печати', 'error');
        }
    }

    async showPrinterDetails(printerId) {
        const printer = this.printers.find(p => p.id === printerId);
        if (!printer) return;

        const status = await this.getPrinterStatus(printerId);
        
        document.getElementById('detail-printer-name').textContent = printer.name;
        document.getElementById('detail-printer-id').textContent = printer.id;
        document.getElementById('detail-printer-ip').textContent = printer.ip_address;
        document.getElementById('detail-printer-status').textContent = this.getStatusText(status.online ? 'online' : 'offline');
        
        const webcamImg = document.getElementById('detail-webcam');
        if (status.online) {
            webcamImg.src = printer.webcam_url;
        } else {
            webcamImg.src = '';
            webcamImg.alt = 'Принтер недоступен';
        }

        // Температуры
        if (status.temperature) {
            const extruderTemp = status.temperature.extruder?.temperature || 0;
            const bedTemp = status.temperature.heater_bed?.temperature || 0;
            
            document.getElementById('detail-extruder-temp').textContent = `${Math.round(extruderTemp)}°C`;
            document.getElementById('detail-bed-temp').textContent = `${Math.round(bedTemp)}°C`;
        }

        // Файлы
        const filesList = document.getElementById('detail-files-list');
        filesList.innerHTML = '';
        
        if (status.files) {
            status.files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
                    <div class="file-name">${file.pathname.split('/').pop()}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                `;
                filesList.appendChild(fileItem);
            });
        }

        // Обработчик открытия веб-интерфейса принтера
        document.getElementById('open-printer-web').onclick = () => {
            window.open(`http://${printer.ip_address}:7125`, '_blank');
        };

        this.showModal('printer-details-modal');
    }

    async uploadFile() {
        const fileInput = document.getElementById('file-input');
        const fileDescription = document.getElementById('file-description').value;
        
        if (!fileInput.files[0]) {
            this.showNotification('Выберите файл', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (fileDescription) {
            formData.append('description', fileDescription);
        }

        try {
            const response = await fetch('/api/files', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const uploadedFile = await response.json();
                this.showNotification('Файл загружен в систему успешно', 'success');
                this.hideModal('upload-file-modal');
                
                // Очистка формы
                fileInput.value = '';
                document.getElementById('file-description').value = '';
                
                // Если мы находимся на панели файлов, обновляем список
                if (document.getElementById('files-panel').style.display !== 'none') {
                    this.loadFiles();
                }
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Ошибка загрузки файла', 'error');
            }
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            this.showNotification('Ошибка загрузки файла', 'error');
        }
    }

    async refreshPrinterStatus(printerId) {
        const status = await this.getPrinterStatus(printerId);
        const printer = this.printers.find(p => p.id === printerId);
        if (printer) {
            printer.status = status;
            this.updatePrinterCard(printer);
        }
    }

    updatePrinterCard(printer) {
        const card = document.querySelector(`[data-printer-id="${printer.id}"]`);
        if (card) {
            const newCard = this.createPrinterCard(printer);
            card.replaceWith(newCard);
        }
    }

    getFilteredPrinters() {
        let filtered = this.printers;

        // Фильтр по статусу
        if (this.statusFilter !== 'all') {
            filtered = filtered.filter(printer => {
                const status = printer.status || { online: false };
                const printStats = status.print_stats || {};
                
                switch (this.statusFilter) {
                    case 'ready':
                        return status.online && !printStats.filename;
                    case 'attention':
                        return printStats.state === 'error' || !status.online;
                    case 'completed':
                        return printStats.state === 'complete';
                    case 'idle':
                        return status.online && !printStats.filename;
                    default:
                        return true;
                }
            });
        }

        return filtered;
    }

    applyFilters() {
        this.renderPrinters();
    }

    setActiveStatusTab(tab) {
        document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.statusFilter = tab.dataset.status;
        this.applyFilters();
    }

    setActiveView(view) {
        this.currentView = view;
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        const container = document.getElementById('printers-container');
        if (view === 'list') {
            container.classList.add('list-view');
        } else {
            container.classList.remove('list-view');
        }
    }

    setActiveNavItem(item) {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
    }

    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.printer-select');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            if (checked) {
                this.selectedPrinters.add(checkbox.dataset.printerId);
            } else {
                this.selectedPrinters.delete(checkbox.dataset.printerId);
            }
        });
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const count = this.selectedPrinters.size;
        document.getElementById('selected-count').textContent = count;
        document.getElementById('bulk-action-btn').disabled = count === 0;
    }

    updateCounters() {
        const filteredPrinters = this.getFilteredPrinters();
        const statusCounts = {
            total: this.printers.length,
            ready: 0,
            attention: 0,
            completed: 0,
            idle: 0
        };

        this.printers.forEach(printer => {
            const status = printer.status || { online: false };
            const printStats = status.print_stats || {};
            
            if (status.online && !printStats.filename) {
                statusCounts.ready++;
                statusCounts.idle++;
            } else if (printStats.state === 'error' || !status.online) {
                statusCounts.attention++;
            } else if (printStats.state === 'complete') {
                statusCounts.completed++;
            }
        });

        document.getElementById('total-printers').textContent = statusCounts.total;
        document.getElementById('ready-printers').textContent = statusCounts.ready;
        document.getElementById('attention-printers').textContent = statusCounts.attention;
        document.getElementById('completed-printers').textContent = statusCounts.completed;
        document.getElementById('idle-printers').textContent = statusCounts.idle;
        document.getElementById('filtered-count').textContent = filteredPrinters.length;
    }

    getStatusText(status) {
        const statusMap = {
            'printing': 'Печать',
            'paused': 'Пауза',
            'idle': 'Ожидание',
            'error': 'Ошибка',
            'offline': 'Недоступен',
            'online': 'Онлайн',
            'completed': 'Завершено'
        };
        return statusMap[status] || status;
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}ч${minutes}м`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Б';
        const k = 1024;
        const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    showNotification(message, type = 'info') {
        // Создание уведомления
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Стили для уведомления
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 5px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        // Цвета для разных типов уведомлений
        const colors = {
            success: '#27ae60',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Удаление уведомления через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    showEditTagsModal() {
        this.showNotification('Функция редактирования тегов будет добавлена в следующей версии', 'info');
    }

    // Переключение между панелями
    switchPanel(panelName) {
        // Скрываем все панели
        const panels = [
            'printers-container',
            'files-panel',
            'jobs-panel',
            'users-panel',
            'reports-panel',
            'settings-panel'
        ];

        panels.forEach(panelId => {
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.style.display = 'none';
            }
        });

        // Показываем нужную панель
        let targetPanelId;
        switch (panelName) {
            case 'dashboard':
            case 'printers':
                targetPanelId = 'printers-container';
                break;
            case 'files':
                targetPanelId = 'files-panel';
                this.loadFiles();
                break;
            case 'jobs':
                targetPanelId = 'jobs-panel';
                this.loadJobs();
                break;
            case 'users':
                targetPanelId = 'users-panel';
                this.loadUsers();
                break;
            case 'reports':
                targetPanelId = 'reports-panel';
                this.loadReports();
                break;
            case 'settings':
                targetPanelId = 'settings-panel';
                this.loadSettings();
                break;
            default:
                targetPanelId = 'printers-container';
        }

        const targetPanel = document.getElementById(targetPanelId);
        if (targetPanel) {
            targetPanel.style.display = 'flex';
        }
    }

    // Загрузка файлов
    async loadFiles() {
        try {
            const response = await fetch('/api/files');
            const files = await response.json();
            this.renderFiles(files);
        } catch (error) {
            console.error('Ошибка загрузки файлов:', error);
            this.showNotification('Ошибка загрузки файлов', 'error');
        }
    }

    renderFiles(files) {
        const container = document.getElementById('files-grid');
        if (!container) return;

        container.innerHTML = '';

        files.forEach(file => {
            const fileElement = this.createFileElement(file);
            container.appendChild(fileElement);
        });
    }

    createFileElement(file) {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.dataset.fileId = file.id;

        const icon = this.getFileIcon(file.type);
        const size = this.formatFileSize(file.size);
        const modified = new Date(file.modified || file.uploaded).toLocaleDateString();
        const description = file.description ? `<div class="file-description">${file.description}</div>` : '';

        div.innerHTML = `
            <div class="file-icon">
                <i class="${icon}"></i>
            </div>
            <div class="file-content">
                <div class="file-name">${file.name}</div>
                <div class="file-info">${size} • ${modified}</div>
                ${description}
            </div>
            <div class="file-actions">
                <button class="file-action-btn" onclick="printerManager.downloadFile('${file.id}')" title="Скачать">
                    <i class="fas fa-download"></i>
                </button>
                <button class="file-action-btn" onclick="printerManager.deleteFile('${file.id}')" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        return div;
    }

    getFileIcon(type) {
        const icons = {
            'gcode': 'fas fa-cube',
            '3mf': 'fas fa-cube',
            'stl': 'fas fa-cube',
            'folder': 'fas fa-folder',
            'default': 'fas fa-file'
        };
        return icons[type] || icons.default;
    }

    // Загрузка заданий
    async loadJobs() {
        try {
            const response = await fetch('/api/jobs');
            const jobs = await response.json();
            this.renderJobs(jobs);
        } catch (error) {
            console.error('Ошибка загрузки заданий:', error);
            this.showNotification('Ошибка загрузки заданий', 'error');
        }
    }

    renderJobs(jobs) {
        const container = document.getElementById('jobs-list');
        if (!container) return;

        container.innerHTML = '';

        jobs.forEach(job => {
            const jobElement = this.createJobElement(job);
            container.appendChild(jobElement);
        });
    }

    createJobElement(job) {
        const div = document.createElement('div');
        div.className = 'job-card';
        div.dataset.jobId = job.id;

        const statusClass = this.getJobStatusClass(job.status);
        const printers = job.printers.map(p => `<span class="printer-tag">${p}</span>`).join('');
        const created = new Date(job.created).toLocaleDateString();

        div.innerHTML = `
            <div class="job-header">
                <div>
                    <div class="job-title">${job.name}</div>
                    <div class="job-info">Создано: ${created}</div>
                </div>
                <span class="job-status ${statusClass}">${this.getJobStatusText(job.status)}</span>
            </div>
            <div class="job-details">
                <div class="job-info">
                    <strong>Файл:</strong> ${job.filename}<br>
                    <strong>Количество:</strong> ${job.quantity} шт.<br>
                    <strong>Приоритет:</strong> ${this.getPriorityText(job.priority)}
                </div>
                <div class="job-info">
                    <strong>Прогресс:</strong> ${job.progress}%<br>
                    <strong>Время:</strong> ${job.estimated_time}<br>
                    <strong>Материал:</strong> ${job.material}
                </div>
            </div>
            <div class="job-printers">
                ${printers}
            </div>
            <div class="job-actions">
                ${this.getJobActions(job)}
            </div>
        `;

        return div;
    }

    getJobStatusClass(status) {
        const classes = {
            'pending': 'pending',
            'running': 'running',
            'completed': 'completed',
            'failed': 'failed'
        };
        return classes[status] || 'pending';
    }

    getJobStatusText(status) {
        const texts = {
            'pending': 'Ожидает',
            'running': 'Выполняется',
            'completed': 'Завершено',
            'failed': 'Ошибка'
        };
        return texts[status] || 'Неизвестно';
    }

    getPriorityText(priority) {
        const texts = {
            'low': 'Низкий',
            'normal': 'Обычный',
            'high': 'Высокий'
        };
        return texts[priority] || priority;
    }

    getRoleText(role) {
        const texts = {
            'admin': 'Администратор',
            'operator': 'Оператор',
            'viewer': 'Наблюдатель'
        };
        return texts[role] || role;
    }

    getJobActions(job) {
        let actions = '';
        
        if (job.status === 'pending') {
            actions += '<button class="btn btn-primary btn-sm" onclick="printerManager.startJob(\'' + job.id + '\')">Запустить</button>';
            actions += '<button class="btn btn-danger btn-sm" onclick="printerManager.deleteJob(\'' + job.id + '\')">Удалить</button>';
        } else if (job.status === 'running') {
            actions += '<button class="btn btn-warning btn-sm" onclick="printerManager.pauseJob(\'' + job.id + '\')">Пауза</button>';
            actions += '<button class="btn btn-danger btn-sm" onclick="printerManager.cancelJob(\'' + job.id + '\')">Отменить</button>';
        } else if (job.status === 'completed') {
            actions += '<button class="btn btn-secondary btn-sm" onclick="printerManager.downloadJobResult(\'' + job.id + '\')">Скачать результат</button>';
        }

        return actions;
    }

    // Загрузка пользователей
    async loadUsers() {
        try {
            const response = await fetch('/api/users');
            const users = await response.json();
            this.renderUsers(users);
        } catch (error) {
            console.error('Ошибка загрузки пользователей:', error);
            this.showNotification('Ошибка загрузки пользователей', 'error');
        }
    }

    renderUsers(users) {
        const container = document.getElementById('users-list');
        if (!container) return;

        container.innerHTML = '';

        users.forEach(user => {
            const userElement = this.createUserElement(user);
            container.appendChild(userElement);
        });
    }

    createUserElement(user) {
        const div = document.createElement('div');
        div.className = 'user-card';
        div.dataset.userId = user.id;

        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const roleText = this.getRoleText(user.role);

        div.innerHTML = `
            <div class="user-avatar">${initials}</div>
            <div class="user-name">${user.name}</div>
            <div class="user-email">${user.email}</div>
            <div class="user-role">${roleText}</div>
            <div class="user-actions">
                <button class="btn btn-primary btn-sm" onclick="printerManager.editUser('${user.id}')">Редактировать</button>
                <button class="btn btn-danger btn-sm" onclick="printerManager.deleteUser('${user.id}')">Удалить</button>
            </div>
        `;

        return div;
    }

    // Загрузка отчетов
    async loadReports() {
        try {
            await this.loadPrintingStats();
            await this.loadPrinterPerformance();
            await this.loadMaterialUsage();
        } catch (error) {
            console.error('Ошибка загрузки отчетов:', error);
            this.showNotification('Ошибка загрузки отчетов', 'error');
        }
    }

    async loadPrintingStats() {
        const container = document.getElementById('printing-stats');
        if (!container) return;

        // Здесь будет загрузка статистики печати
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${this.printers.length}</div>
                    <div class="stat-label">Всего принтеров</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${this.printers.filter(p => p.status?.online).length}</div>
                    <div class="stat-label">Онлайн</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${this.printers.filter(p => p.status?.print_stats?.state === 'printing').length}</div>
                    <div class="stat-label">Печатают</div>
                </div>
            </div>
        `;
    }

    async loadPrinterPerformance() {
        const container = document.getElementById('printer-performance');
        if (!container) return;

        container.innerHTML = `
            <div class="performance-chart">
                <p>График производительности будет добавлен в следующей версии</p>
            </div>
        `;
    }

    async loadMaterialUsage() {
        const container = document.getElementById('material-usage');
        if (!container) return;

        container.innerHTML = `
            <div class="material-stats">
                <p>Статистика использования материалов будет добавлена в следующей версии</p>
            </div>
        `;
    }

    // Загрузка настроек
    async loadSettings() {
        this.setupSettingsTabs();
        this.loadGeneralSettings();
    }

    setupSettingsTabs() {
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchSettingsTab(tabName);
            });
        });
    }

    switchSettingsTab(tabName) {
        // Убираем активный класс со всех вкладок
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Убираем активный класс со всех секций
        document.querySelectorAll('.settings-section').forEach(section => {
            section.classList.remove('active');
        });

        // Активируем нужную вкладку и секцию
        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        const activeSection = document.getElementById(`${tabName}-settings`);

        if (activeTab) activeTab.classList.add('active');
        if (activeSection) activeSection.classList.add('active');
    }

    loadGeneralSettings() {
        // Загружаем текущие настройки
        const settings = this.getSettings();
        
        if (settings.systemName) {
            document.getElementById('system-name').value = settings.systemName;
        }
        if (settings.updateInterval) {
            document.getElementById('update-interval').value = settings.updateInterval;
        }
        if (settings.timezone) {
            document.getElementById('timezone').value = settings.timezone;
        }
    }

    getSettings() {
        const settings = localStorage.getItem('fcrm-settings');
        return settings ? JSON.parse(settings) : {};
    }

    saveSettings(settings) {
        localStorage.setItem('fcrm-settings', JSON.stringify(settings));
    }

    setupPanelEventListeners() {
        // Панель файлов
        const uploadFileBtn = document.getElementById('upload-file-btn');
        if (uploadFileBtn) {
            uploadFileBtn.addEventListener('click', () => {
                this.showModal('upload-file-modal');
            });
        }

        const createFolderBtn = document.getElementById('create-folder-btn');
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => {
                this.showCreateFolderModal();
            });
        }

        const refreshFilesBtn = document.getElementById('refresh-files-btn');
        if (refreshFilesBtn) {
            refreshFilesBtn.addEventListener('click', () => {
                this.loadFiles();
            });
        }

        // Панель заданий
        const createJobBtn = document.getElementById('create-job-btn');
        if (createJobBtn) {
            createJobBtn.addEventListener('click', () => {
                this.showCreateJobModal();
            });
        }

        // Панель пользователей
        const addUserBtn = document.getElementById('add-user-btn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => {
                this.showAddUserModal();
            });
        }

        // Панель отчетов
        const exportReportBtn = document.getElementById('export-report-btn');
        if (exportReportBtn) {
            exportReportBtn.addEventListener('click', () => {
                this.exportReport();
            });
        }

        // Панель настроек
        const createBackupBtn = document.getElementById('create-backup-btn');
        if (createBackupBtn) {
            createBackupBtn.addEventListener('click', () => {
                this.createBackup();
            });
        }

        const restoreBackupBtn = document.getElementById('restore-backup-btn');
        if (restoreBackupBtn) {
            restoreBackupBtn.addEventListener('click', () => {
                this.restoreBackup();
            });
        }

        // Формы настроек
        const generalSettingsForm = document.getElementById('general-settings-form');
        if (generalSettingsForm) {
            generalSettingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveGeneralSettings();
            });
        }

        const notificationsSettingsForm = document.getElementById('notifications-settings-form');
        if (notificationsSettingsForm) {
            notificationsSettingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveNotificationsSettings();
            });
        }

        const securitySettingsForm = document.getElementById('security-settings-form');
        if (securitySettingsForm) {
            securitySettingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSecuritySettings();
            });
        }

        // Обработчики для новых модальных окон
        const saveJobBtn = document.getElementById('save-job');
        if (saveJobBtn) {
            saveJobBtn.addEventListener('click', () => {
                this.createJob();
            });
        }

        const saveUserBtn = document.getElementById('save-user');
        if (saveUserBtn) {
            saveUserBtn.addEventListener('click', () => {
                this.createUser();
            });
        }
    }

    // Функции для работы с модальными окнами
    showCreateFolderModal() {
        this.showNotification('Создание папок будет добавлено в следующей версии', 'info');
    }

    async showCreateJobModal() {
        try {
            // Загружаем список файлов
            const filesResponse = await fetch('/api/files');
            const files = await filesResponse.json();
            
            const fileSelect = document.getElementById('job-file');
            fileSelect.innerHTML = '<option value="">Выберите файл</option>';
            
            files.forEach(file => {
                if (file.type === 'gcode' || file.type === '3mf') {
                    const option = document.createElement('option');
                    option.value = file.id;
                    option.textContent = file.name;
                    fileSelect.appendChild(option);
                }
            });

            // Загружаем список принтеров
            const printersList = document.getElementById('job-printers-list');
            printersList.innerHTML = '';
            
            this.printers.forEach(printer => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `printer-${printer.id}`;
                checkbox.value = printer.id;
                
                const label = document.createElement('label');
                label.htmlFor = `printer-${printer.id}`;
                label.textContent = printer.name;
                
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.appendChild(checkbox);
                div.appendChild(label);
                printersList.appendChild(div);
            });

            this.showModal('create-job-modal');
        } catch (error) {
            console.error('Ошибка загрузки данных для создания задания:', error);
            this.showNotification('Ошибка загрузки данных', 'error');
        }
    }

    async showAddUserModal() {
        this.showModal('add-user-modal');
    }

    exportReport() {
        this.showNotification('Экспорт отчетов будет добавлен в следующей версии', 'info');
    }

    createBackup() {
        this.showNotification('Резервное копирование будет добавлено в следующей версии', 'info');
    }

    restoreBackup() {
        this.showNotification('Восстановление из резервной копии будет добавлено в следующей версии', 'info');
    }

    saveGeneralSettings() {
        const settings = {
            systemName: document.getElementById('system-name').value,
            updateInterval: parseInt(document.getElementById('update-interval').value),
            timezone: document.getElementById('timezone').value
        };

        this.saveSettings(settings);
        this.showNotification('Настройки сохранены', 'success');
    }

    saveNotificationsSettings() {
        const settings = {
            emailNotifications: document.getElementById('email-notifications').checked,
            browserNotifications: document.getElementById('browser-notifications').checked,
            notificationEmail: document.getElementById('notification-email').value
        };

        this.saveSettings({ ...this.getSettings(), notifications: settings });
        this.showNotification('Настройки уведомлений сохранены', 'success');
    }

    saveSecuritySettings() {
        const settings = {
            sessionTimeout: parseInt(document.getElementById('session-timeout').value),
            requireAuth: document.getElementById('require-auth').checked
        };

        this.saveSettings({ ...this.getSettings(), security: settings });
        this.showNotification('Настройки безопасности сохранены', 'success');
    }

    // Функции для работы с файлами
    async downloadFile(fileId) {
        try {
            window.open(`/api/files/${fileId}/download`, '_blank');
            this.showNotification('Файл скачивается', 'success');
        } catch (error) {
            console.error('Ошибка скачивания файла:', error);
            this.showNotification('Ошибка скачивания файла', 'error');
        }
    }

    async deleteFile(fileId) {
        if (!confirm('Вы уверены, что хотите удалить этот файл?')) {
            return;
        }

        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Файл удален', 'success');
                this.loadFiles(); // Перезагружаем список файлов
            } else {
                this.showNotification('Ошибка удаления файла', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления файла:', error);
            this.showNotification('Ошибка удаления файла', 'error');
        }
    }

    // Функции для работы с заданиями
    async startJob(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}/start`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showNotification('Задание запущено', 'success');
                this.loadJobs(); // Перезагружаем список заданий
            } else {
                this.showNotification('Ошибка запуска задания', 'error');
            }
        } catch (error) {
            console.error('Ошибка запуска задания:', error);
            this.showNotification('Ошибка запуска задания', 'error');
        }
    }

    async pauseJob(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}/pause`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showNotification('Задание приостановлено', 'success');
                this.loadJobs();
            } else {
                this.showNotification('Ошибка приостановки задания', 'error');
            }
        } catch (error) {
            console.error('Ошибка приостановки задания:', error);
            this.showNotification('Ошибка приостановки задания', 'error');
        }
    }

    async cancelJob(jobId) {
        if (!confirm('Вы уверены, что хотите отменить это задание?')) {
            return;
        }

        try {
            const response = await fetch(`/api/jobs/${jobId}/cancel`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showNotification('Задание отменено', 'success');
                this.loadJobs();
            } else {
                this.showNotification('Ошибка отмены задания', 'error');
            }
        } catch (error) {
            console.error('Ошибка отмены задания:', error);
            this.showNotification('Ошибка отмены задания', 'error');
        }
    }

    async deleteJob(jobId) {
        if (!confirm('Вы уверены, что хотите удалить это задание?')) {
            return;
        }

        try {
            const response = await fetch(`/api/jobs/${jobId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Задание удалено', 'success');
                this.loadJobs();
            } else {
                this.showNotification('Ошибка удаления задания', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления задания:', error);
            this.showNotification('Ошибка удаления задания', 'error');
        }
    }

    downloadJobResult(jobId) {
        this.showNotification('Скачивание результатов заданий будет добавлено в следующей версии', 'info');
    }

    // Функции создания заданий и пользователей
    async createJob() {
        const name = document.getElementById('job-name').value;
        const fileId = document.getElementById('job-file').value;
        const quantity = parseInt(document.getElementById('job-quantity').value);
        const priority = document.getElementById('job-priority').value;
        const material = document.getElementById('job-material').value;

        if (!name || !fileId) {
            this.showNotification('Заполните обязательные поля', 'error');
            return;
        }

        // Получаем выбранные принтеры
        const selectedPrinters = [];
        this.printers.forEach(printer => {
            const checkbox = document.getElementById(`printer-${printer.id}`);
            if (checkbox && checkbox.checked) {
                selectedPrinters.push(printer.id);
            }
        });

        try {
            const response = await fetch('/api/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    filename: fileId,
                    quantity,
                    priority,
                    material,
                    printers: selectedPrinters
                })
            });

            if (response.ok) {
                const job = await response.json();
                this.showNotification('Задание создано успешно', 'success');
                this.hideModal('create-job-modal');
                document.getElementById('create-job-form').reset();
                this.loadJobs(); // Перезагружаем список заданий
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Ошибка создания задания', 'error');
            }
        } catch (error) {
            console.error('Ошибка создания задания:', error);
            this.showNotification('Ошибка создания задания', 'error');
        }
    }

    async createUser() {
        const name = document.getElementById('user-name').value;
        const email = document.getElementById('user-email').value;
        const role = document.getElementById('user-role').value;

        if (!name || !email) {
            this.showNotification('Заполните обязательные поля', 'error');
            return;
        }

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    email,
                    role
                })
            });

            if (response.ok) {
                const user = await response.json();
                this.showNotification('Пользователь добавлен успешно', 'success');
                this.hideModal('add-user-modal');
                document.getElementById('add-user-form').reset();
                this.loadUsers(); // Перезагружаем список пользователей
            } else {
                const error = await response.json();
                this.showNotification(error.error || 'Ошибка добавления пользователя', 'error');
            }
        } catch (error) {
            console.error('Ошибка добавления пользователя:', error);
            this.showNotification('Ошибка добавления пользователя', 'error');
        }
    }

    // Функции для работы с пользователями
    editUser(userId) {
        this.showNotification('Редактирование пользователей будет добавлено в следующей версии', 'info');
    }

    async deleteUser(userId) {
        if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) {
            return;
        }

        try {
            const response = await fetch(`/api/users/${userId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.showNotification('Пользователь удален', 'success');
                this.loadUsers(); // Перезагружаем список пользователей
            } else {
                this.showNotification('Ошибка удаления пользователя', 'error');
            }
        } catch (error) {
            console.error('Ошибка удаления пользователя:', error);
            this.showNotification('Ошибка удаления пользователя', 'error');
        }
    }
}

// Добавление CSS анимаций для уведомлений
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Инициализация при загрузке страницы
let printerManager;
document.addEventListener('DOMContentLoaded', () => {
    printerManager = new PrinterManager();
});
