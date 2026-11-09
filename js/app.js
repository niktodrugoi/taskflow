(() => {
  'use strict';

  const STORAGE_KEY = 'taskflow.tasks.v1';

  /* ---------- Storage: работа с localStorage ---------- */
  const Storage = {
    load() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!Array.isArray(data)) return [];
        return data.filter(t => t && typeof t.id === 'string' && typeof t.text === 'string'
          && t.text.trim() !== '' && typeof t.completed === 'boolean')
          .map(t => ({ id: t.id, text: t.text.trim(), completed: t.completed }));
      } catch {
        return [];
      }
    },
    save(tasks) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch { /* хранилище недоступно */ }
    },
  };

  /* ---------- Store: состояние и операции над задачами ---------- */
  const createId = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const state = { tasks: Storage.load(), filter: 'all' };
  const commit = () => Storage.save(state.tasks);

  const Tasks = {
    add(rawText) {
      const text = rawText.trim();
      if (!text) return null;
      const task = { id: createId(), text, completed: false };
      state.tasks.unshift(task);
      commit();
      return task;
    },
    toggle(id) {
      const task = state.tasks.find(t => t.id === id);
      if (task) { task.completed = !task.completed; commit(); }
    },
    remove(id) {
      state.tasks = state.tasks.filter(t => t.id !== id);
      commit();
    },
    clearCompleted() {
      state.tasks = state.tasks.filter(t => !t.completed);
      commit();
    },
    visible() {
      if (state.filter === 'active') return state.tasks.filter(t => !t.completed);
      if (state.filter === 'completed') return state.tasks.filter(t => t.completed);
      return state.tasks;
    },
    counts() {
      const done = state.tasks.filter(t => t.completed).length;
      return { total: state.tasks.length, done, left: state.tasks.length - done };
    },
  };

  /* ---------- View: отображение ---------- */
  const $ = id => document.getElementById(id);
  const el = {
    form: $('task-form'), input: $('task-input'), error: $('form-error'), list: $('task-list'),
    empty: $('empty'), emptyTitle: $('empty-title'), emptyText: $('empty-text'),
    total: $('stat-total'), done: $('stat-done'), left: $('stat-left'), leftText: $('left-text'),
    clear: $('clear-btn'), dialog: $('confirm'), confirmText: $('confirm-text'),
    filters: document.querySelectorAll('.filter'),
  };

  const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICON_TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>';

  const plural = (n, [one, few, many]) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };

  const EMPTY_MESSAGES = {
    all: ['Пока нет задач', 'Введите задачу в поле выше и нажмите «Добавить».'],
    active: ['Нет активных задач', 'Все задачи выполнены или список пуст.'],
    completed: ['Нет выполненных задач', 'Отметьте задачу чекбоксом, и она появится здесь.'],
  };

  function createTaskItem(task, isNew) {
    const li = document.createElement('li');
    li.className = 'task' + (task.completed ? ' is-done' : '') + (isNew ? ' is-new' : '');
    li.dataset.id = task.id;

    const label = document.createElement('label');
    label.className = 'task__label';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'task__check';
    check.checked = task.completed;
    const box = document.createElement('span');
    box.className = 'task__box';
    box.innerHTML = ICON_CHECK; // статичная иконка, пользовательский текст не используется
    const text = document.createElement('span');
    text.className = 'task__text';
    text.textContent = task.text;
    label.append(check, box, text);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'task__del';
    del.setAttribute('aria-label', `Удалить задачу: ${task.text}`);
    del.innerHTML = ICON_TRASH;

    li.append(label, del);
    return li;
  }

  let lastAddedId = null;

  function render() {
    const { total, done, left } = Tasks.counts();
    el.total.textContent = total;
    el.done.textContent = done;
    el.left.textContent = left;
    el.leftText.textContent = `Осталось: ${left} ${plural(left, ['задача', 'задачи', 'задач'])}`;
    el.clear.disabled = done === 0;

    el.filters.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.filter === state.filter)));

    const visible = Tasks.visible();
    el.list.replaceChildren(...visible.map(t => createTaskItem(t, t.id === lastAddedId)));
    lastAddedId = null;

    const isEmpty = visible.length === 0;
    el.empty.hidden = !isEmpty;
    if (isEmpty) {
      const key = total === 0 ? 'all' : state.filter;
      [el.emptyTitle.textContent, el.emptyText.textContent] = EMPTY_MESSAGES[key];
    }
  }

  function showError(message) {
    el.error.hidden = !message;
    el.error.textContent = message || '';
    el.input.setAttribute('aria-invalid', String(Boolean(message)));
  }

  /* ---------- Controller: обработчики событий ---------- */
  el.form.addEventListener('submit', e => {
    e.preventDefault(); // отправка по Enter и по кнопке обрабатывается одним событием
    const task = Tasks.add(el.input.value);
    if (!task) {
      showError('Введите текст задачи.');
      el.input.focus();
      return;
    }
    showError('');
    el.input.value = '';
    lastAddedId = task.id;
    if (state.filter === 'completed') state.filter = 'all';
    render();
    el.input.focus();
  });

  el.input.addEventListener('input', () => showError(''));

  el.list.addEventListener('change', e => {
    const id = e.target.closest('.task')?.dataset.id;
    if (id && e.target.matches('.task__check')) { Tasks.toggle(id); render(); }
  });

  el.list.addEventListener('click', e => {
    const btn = e.target.closest('.task__del');
    if (btn) { Tasks.remove(btn.closest('.task').dataset.id); render(); el.input.focus(); }
  });

  el.filters.forEach(btn => btn.addEventListener('click', () => {
    state.filter = btn.dataset.filter;
    render();
  }));

  el.clear.addEventListener('click', () => {
    const { done } = Tasks.counts();
    if (!done) return;
    el.confirmText.textContent = `Будет удалено: ${done} ${plural(done, ['задача', 'задачи', 'задач'])}. Это действие нельзя отменить.`;
    if (typeof el.dialog.showModal === 'function') el.dialog.showModal();
    else if (window.confirm(el.confirmText.textContent)) { Tasks.clearCompleted(); render(); }
  });

  el.dialog.addEventListener('close', () => {
    if (el.dialog.returnValue === 'ok') { Tasks.clearCompleted(); render(); }
    el.dialog.returnValue = '';
  });

  render();
})();
