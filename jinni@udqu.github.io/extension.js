// SPDX-License-Identifier: GPL-2.0-or-later
//
// Jinni (For GNOME) - a quick access task manager in the GNOME Shell top bar
// Copyright (C) 2026  udqu
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Popup Preview Window Class
class TaskPreview {
    constructor(isEnabled, maxWidth, hoverTime) {
        this.isEnabled = isEnabled;
        this.maxWidth = maxWidth;
        this.hoverTime = hoverTime;

        this._popup = new St.BoxLayout({
            style_class: 'task-preview-box',
            vertical: true,
            visible: false,
            reactive: true,
        });

        this._popupLabel = new St.Label({
            style_class: 'task-preview-label',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            width: maxWidth,
        });

        let clutterText = this._popupLabel.clutter_text;
        clutterText.set_line_wrap(true);
        clutterText.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);

        this._popup.add_child(this._popupLabel);
        Main.layoutManager.addChrome(this._popup);
    }

    show(text, relativeTo) {
        if (!this.isEnabled) { return; }

        this._popupLabel.set_text(text);
        this._popup.show();

        let padding = this._popupLabel.get_theme_node().get_padding(St.Side.ALL);
        let popupWidth = this.maxWidth + 2 * padding;

        let [minWidth, minHeight, natWidth, natHeight] = this._popupLabel.get_preferred_size();
        this._popup.set_size(popupWidth, natHeight);

        // Position it to the left of the task, matching how the preview
        // reads relative to the panel's top-bar layout
        let [posX, posY] = relativeTo.get_transformed_position();
        let [containerWidth, containerHeight] = relativeTo.get_transformed_size();
        this._popup.set_position(posX - popupWidth - 10, posY);
    }

    hide() {
        if (!this.isEnabled) { return; }
        this._popup.hide();
    }

    updateSettings(isEnabled, maxWidth, hoverTime) {
        this.isEnabled = isEnabled;
        this.maxWidth = maxWidth;
        this.hoverTime = hoverTime;
        this._popupLabel.width = maxWidth;
    }

    destroy() {
        if (this._popup) {
            Main.layoutManager.removeChrome(this._popup);
            if (this._popupLabel) {
                this._popupLabel.destroy();
                this._popupLabel = null;
            }
            this._popup.destroy();
            this._popup = null;
        }
    }
}

// TaskContainer class to handle task items
class TaskContainer {
    constructor(text, onDelete, onClick, taskPreview) {
        this.container = new St.BoxLayout({ vertical: false, style_class: 'task-container', reactive: true });

        this.textLabel = new St.Label({
            text: text,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'counter-list-item',
            x_expand: true
        });

        this.deleteButton = new St.Button({
            label: '✔ | ✖',
            style_class: 'delete-button',
            visible: false
        });

        this._onDelete = onDelete;
        this._onClick = onClick;
        this._clickCount = 0;
        this._clickResetTimeoutId = null;
        this._hoverTimeoutId = null;
        this._taskPreview = taskPreview;
        // Set from outside via updateHoverState(), not this task's own
        // enter/leave-event -- see that method for why.
        this._isHovered = false;
        this._dragThresholdPollId = null;

        // Connect button_press_event to handle single and double clicks
        this._buttonPressEventId = this.container.connect('button_press_event', (actor, event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY && this._isMouseWithinActor(this.textLabel, event)) {
                this._clickCount++;
                if (this._clickCount === 1) {
                    this._onClick('single', this);
                } else if (this._clickCount === 2) {
                    this._onClick('double', this);
                }
                // Use the desktop's configured double-click time, not a
                // hardcoded value; cancel any previous pending reset
                if (this._clickResetTimeoutId !== null) {
                    GLib.Source.remove(this._clickResetTimeoutId);
                }
                let doubleClickTime = Clutter.Settings.get_default().double_click_time;
                this._clickResetTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, doubleClickTime, () => {
                    this._clickCount = 0;
                    this._clickResetTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });

                // This same press might also turn into a drag
                this._trackDragThreshold(event);
            }
        });

        this._deleteButtonClickedEventId = this.deleteButton.connect('clicked', () => {
            if (this._onDelete) {
                this._onDelete(this);
            }
        });

        this.container.add_child(this.textLabel);
        this.container.add_child(this.deleteButton);
    }

    // Whether (x, y) falls within this row -- used by the list-wide motion
    // tracking. Includes the delete button, so hovering it doesn't flicker.
    isPointAt(x, y) {
        if (!this.container || !this.container.get_stage()) {
            return false;
        }
        let [x1, y1] = this.container.get_transformed_position();
        let [width, height] = this.container.get_transformed_size();
        return x >= x1 && x <= x1 + width && y >= y1 && y <= y1 + height;
    }

    // Show/hide the delete button and start/cancel the preview timer.
    // Driven externally (list-wide motion tracking), not this task's own
    // enter/leave-event -- Clutter can miss leave-event for a row swept
    // past quickly, sticking its state.
    updateHoverState(isHovered) {
        if (isHovered === this._isHovered) {
            return;
        }
        this._isHovered = isHovered;
        if (this.deleteButton) {
            this.deleteButton.visible = isHovered;
        }
        if (isHovered) {
            if (this._hoverTimeoutId === null) {
                this._hoverTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._taskPreview.hoverTime, () => {
                    if (this._taskPreview && this.container && this.container.get_stage()) {
                        this._taskPreview.show(this.getText(), this.container);
                    }
                    this._hoverTimeoutId = null;
                    return GLib.SOURCE_REMOVE;
                });
            }
        } else {
            if (this._hoverTimeoutId !== null) {
                GLib.Source.remove(this._hoverTimeoutId);
                this._hoverTimeoutId = null;
            }
            if (this._taskPreview) {
                this._taskPreview.hide();
            }
        }
    }

    // Force-clears hover state; needed when pulled out of the list for
    // editing, since it stops receiving hover updates at that point.
    resetHoverState() {
        this._isHovered = true;
        this.updateHoverState(false);
    }

    // Notifies onClick('dragstart') once this press moves past the drag
    // threshold. Polls global.get_pointer() rather than motion/release
    // events, which testing showed get delayed while a button is held down.
    _trackDragThreshold(pressEvent) {
        let [startX, startY] = pressEvent.get_coords();
        let threshold = Clutter.Settings.get_default().dnd_drag_threshold;
        this._dragThresholdPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
            let [x, y, mods] = global.get_pointer();
            if (!(mods & Clutter.ModifierType.BUTTON1_MASK)) {
                // Released before the threshold -- just a click
                this._dragThresholdPollId = null;
                return GLib.SOURCE_REMOVE;
            }
            if (Math.hypot(x - startX, y - startY) >= threshold) {
                this._dragThresholdPollId = null;
                if (this.container && this.container.get_stage()) {
                    this._onClick('dragstart', this);
                }
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _disconnectDragThreshold() {
        if (this._dragThresholdPollId !== null) {
            GLib.Source.remove(this._dragThresholdPollId);
            this._dragThresholdPollId = null;
        }
    }

    _isMouseWithinActor(actor, event) {
        let [x, y] = event.get_coords();
        let [x1, y1] = actor.get_transformed_position();
        let [width, height] = actor.get_transformed_size();
        return x >= x1 && x <= x1 + width && y >= y1 && y <= y1 + height;
    }

    setText(newText) {
        if (this.textLabel) {
            this.textLabel.set_text(newText);
        }
    }

    getText() {
        return this.textLabel ? this.textLabel.get_text() : '';
    }

    getContainer() {
        return this.container;
    }

    // Disconnects signals and cancels timers, without touching widgets --
    // for when a parent cascade (indicator destroy) is about to destroy
    // them anyway; destroy()'s own deferred widget destruction would race it.
    cancelPendingWork() {
        if (this.container && this._buttonPressEventId) {
            this.container.disconnect(this._buttonPressEventId);
            this._buttonPressEventId = null;
        }
        if (this.deleteButton && this._deleteButtonClickedEventId) {
            this.deleteButton.disconnect(this._deleteButtonClickedEventId);
            this._deleteButtonClickedEventId = null;
        }
        if (this._hoverTimeoutId !== null) {
            GLib.Source.remove(this._hoverTimeoutId);
            this._hoverTimeoutId = null;
        }
        if (this._clickResetTimeoutId !== null) {
            GLib.Source.remove(this._clickResetTimeoutId);
            this._clickResetTimeoutId = null;
        }
        this._disconnectDragThreshold();
    }

    destroy() {
        this.cancelPendingWork();

        if (this.deleteButton) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this.deleteButton) {
                    this.deleteButton.destroy();
                    this.deleteButton = null;
                }
                return GLib.SOURCE_REMOVE;
            });
        }
        if (this.textLabel) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this.textLabel) {
                    this.textLabel.destroy();
                    this.textLabel = null;
                }
                return GLib.SOURCE_REMOVE;
            });
        }
        if (this.container) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                if (this.container) {
                    this.container.destroy();
                    this.container = null;
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }
}

// Main extension class
export default class JinniExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._settings = null;
        this._widthChangedHandler = null;
        this._persistTasksChangedHandler = null;
        this._enablePreviewsChangedHandler = null;
        this._maxPreviewSizeChangedHandler = null;
        this._hoverTimeChangedHandler = null;
        this._entry = null;
        this._entryButtonPressHandler = null;
        this._entryActivateHandler = null;
        this._listBox = null;
        this._listBoxMotionHandler = null;
        this._listBoxLeaveHandler = null;
        this._indicatorButtonPressHandler = null;
        this._counter = 0;
        this._taskPreview = null;
        this._tasksFilePath = null;
        this._loadCancellable = null;
        // Source of truth for task order/persistence, rather than
        // introspecting _listBox's DOM structure
        this._tasks = [];
        // current edit variables
        this._currentEntry = null;
        this._currentTask = null;
        this._currentIndex = null;
        this._entryFocusOutHandlerId = null;
        // The old editing entry, unparented but not yet destroy()'d -- see
        // _saveCurrentEntry() and disable()
        this._entryPendingDestroy = null;
        this._entryDestroyIdleId = null;
        // drag-and-drop reordering state
        this._menuOpenStateHandler = null;
        this._draggedTask = null;
        this._dragIndicator = null;
        this._dragMotionHandler = null;
        this._dragPollId = null;
    }

    enable() {
        this._tasksFilePath = `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/${this.uuid}/savedTasks.json`;

        this._loadStylesheet();

        // getSettings() throws (rather than returning falsy) if the
        // compiled schema can't be found
        try {
            this._settings = this.getSettings();
        } catch (error) {
            console.error(`Failed to retrieve settings for the extension: ${error.message}`);
            return;
        }

        this._indicator = new PanelMenu.Button(0.0, "Counter Indicator", false);
        this._indicator.add_style_class_name('counter-indicator');

        this._label = new St.Label({
            text: `${this._counter}`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.add_style_class_name('counter-label');
        this._indicator.add_child(this._label);

        this._entry = new St.Entry({
            can_focus: true,
            hint_text: "Type your task here and hit enter",
            style_class: 'counter-entry'
        });
        this._entryButtonPressHandler = this._entry.clutter_text.connect('button_press_event', this._onEntryClicked.bind(this));
        this._entryActivateHandler = this._entry.clutter_text.connect('activate', this._onTextEntered.bind(this));

        this._listBox = new St.BoxLayout({
            vertical: true,
            style_class: 'counter-list',
            reactive: true
        });

        // Drives hover state for all tasks -- see TaskContainer.updateHoverState()
        this._listBoxMotionHandler = this._listBox.connect('motion-event', this._onListBoxMotionEvent.bind(this));
        this._listBoxLeaveHandler = this._listBox.connect('leave-event', this._onListBoxLeaveEvent.bind(this));

        let container = new PopupMenu.PopupMenuSection();
        container.actor.add_child(this._entry);
        container.actor.add_child(this._listBox);
        this._indicator.menu.addMenuItem(container);

        // Force-cancel an in-progress drag if the menu closes for any
        // reason, so no stage-level listener is left dangling
        this._menuOpenStateHandler = this._indicator.menu.connect('open-state-changed', (menu, isOpen) => {
            if (!isOpen && this._draggedTask) {
                this._endDrag(false);
            }
        });

        Main.panel.addToStatusArea('counter-indicator', this._indicator);

        this._widthChangedHandler = this._settings.connect('changed::tasklist-window-width', this._updateWidth.bind(this));
        this._updateWidth();

        // Apply a persist-tasks toggle immediately either way: save the
        // current list the moment it's turned on, or clear the file the
        // moment it's turned off -- rather than waiting on the next add/
        // edit/delete or the next enable().
        this._persistTasksChangedHandler = this._settings.connect('changed::persist-tasks', () => {
            if (this._settings.get_boolean('persist-tasks')) {
                this._saveTasks();
            } else {
                this._clearTasksFile();
            }
        });

        this._taskPreview = new TaskPreview(this._settings.get_boolean('enable-previews'), this._settings.get_int('max-preview-size'), this._settings.get_int('hover-time'));
        this._enablePreviewsChangedHandler = this._settings.connect('changed::enable-previews', this._updateTaskPreviewSettings.bind(this));
        this._maxPreviewSizeChangedHandler = this._settings.connect('changed::max-preview-size', this._updateTaskPreviewSettings.bind(this));
        this._hoverTimeChangedHandler = this._settings.connect('changed::hover-time', this._updateTaskPreviewSettings.bind(this));
        this._updateTaskPreviewSettings();

        this._indicatorButtonPressHandler = this._indicator.connect('button_press_event', this._onIndicatorClicked.bind(this));

        this._loadTasks();
    }

    disable() {
        // Cancel any in-flight async task load -- its success path touches
        // _listBox/_tasks/_label, which are about to be nulled below.
        if (this._loadCancellable) {
            this._loadCancellable.cancel();
            this._loadCancellable = null;
        }
        // Clean up before the actors get torn down below
        if (this._draggedTask) {
            this._endDrag(false);
        }
        // cancelPendingWork(), not destroy() -- the indicator's destroy()
        // cascade handles the widgets; destroy() here would race it.
        this._tasks.forEach(task => task.cancelPendingWork());

        // A pending destroy from _saveCurrentEntry() -- cancel the idle
        // source and destroy directly instead, in case disable() runs
        // before it fires.
        if (this._entryDestroyIdleId !== null) {
            GLib.Source.remove(this._entryDestroyIdleId);
            this._entryDestroyIdleId = null;
        }
        if (this._entryPendingDestroy) {
            this._entryPendingDestroy.destroy();
            this._entryPendingDestroy = null;
        }

        if (this._entry) {
            if (this._entryButtonPressHandler) {
                this._entry.clutter_text.disconnect(this._entryButtonPressHandler);
                this._entryButtonPressHandler = null;
            }
            if (this._entryActivateHandler) {
                this._entry.clutter_text.disconnect(this._entryActivateHandler);
                this._entryActivateHandler = null;
            }
            this._entry.destroy();
            this._entry = null;
        }
        if (this._listBox) {
            if (this._listBoxMotionHandler) {
                this._listBox.disconnect(this._listBoxMotionHandler);
                this._listBoxMotionHandler = null;
            }
            if (this._listBoxLeaveHandler) {
                this._listBox.disconnect(this._listBoxLeaveHandler);
                this._listBoxLeaveHandler = null;
            }
            this._listBox.destroy();
            this._listBox = null;
        }
        if (this._label) {
            this._label.destroy();
            this._label = null;
        }

        if (this._indicator !== null) {
            if (this._menuOpenStateHandler) {
                this._indicator.menu.disconnect(this._menuOpenStateHandler);
                this._menuOpenStateHandler = null;
            }
            if (this._indicatorButtonPressHandler) {
                this._indicator.disconnect(this._indicatorButtonPressHandler);
                this._indicatorButtonPressHandler = null;
            }
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._settings) {
            if (this._widthChangedHandler) {
                this._settings.disconnect(this._widthChangedHandler);
                this._widthChangedHandler = null;
            }
            if (this._persistTasksChangedHandler) {
                this._settings.disconnect(this._persistTasksChangedHandler);
                this._persistTasksChangedHandler = null;
            }
            if (this._enablePreviewsChangedHandler) {
                this._settings.disconnect(this._enablePreviewsChangedHandler);
                this._enablePreviewsChangedHandler = null;
            }
            if (this._maxPreviewSizeChangedHandler) {
                this._settings.disconnect(this._maxPreviewSizeChangedHandler);
                this._maxPreviewSizeChangedHandler = null;
            }
            if (this._hoverTimeChangedHandler) {
                this._settings.disconnect(this._hoverTimeChangedHandler);
                this._hoverTimeChangedHandler = null;
            }
            this._settings = null;
        }
        if (this._entryFocusOutHandlerId) {
            global.stage.disconnect(this._entryFocusOutHandlerId);
            this._entryFocusOutHandlerId = null;
        }
        if (this._taskPreview) {
            this._taskPreview.destroy();
            this._taskPreview = null;
        }
        this._currentEntry = null;
        this._currentTask = null;
        this._currentIndex = null;
        this._tasksFilePath = null;
        this._tasks = [];
        this._counter = 0;
    }

    _updateWidth() {
        let taskListWindowWidth = this._settings.get_int('tasklist-window-width');
        if (taskListWindowWidth) {
            this._indicator.menu.actor.width = taskListWindowWidth;
        } else {
            console.error('Invalid tasklist-window-width setting.');
        }
    }

    _updateTaskPreviewSettings() {
        let enablePreviews = this._settings.get_boolean('enable-previews');
        let maxPreviewSize = this._settings.get_int('max-preview-size');
        let hoverTime = this._settings.get_int('hover-time');
        this._taskPreview.updateSettings(enablePreviews, maxPreviewSize, hoverTime);
    }

    _loadStylesheet() {
        try {
            let themeContext = St.ThemeContext.get_for_stage(global.stage);
            let stylesheet = Gio.File.new_for_path(`${this.path}/stylesheet.css`);
            themeContext.get_theme().load_stylesheet(stylesheet);
        } catch (error) {
            console.error(`Failed to load stylesheet: ${error.message}`);
        }
    }

    // See TaskContainer.updateHoverState() for why this lives here rather
    // than on each task's own enter/leave-event.
    _onListBoxMotionEvent(actor, event) {
        let [x, y] = event.get_coords();
        this._tasks.forEach(task => task.updateHoverState(task.isPointAt(x, y)));
    }

    _onListBoxLeaveEvent() {
        this._tasks.forEach(task => task.updateHoverState(false));
    }

    _onIndicatorClicked(actor, event) {
        if (event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._entry.grab_key_focus();
        }
    }

    _onEntryClicked(actor, event) {
        if (event.get_button() === Clutter.BUTTON_PRIMARY) {
            if (this._currentEntry) {
                this._saveCurrentEntry();
            }
            this._entry.grab_key_focus();
        }
    }

    _onTextEntered() {
        let text = this._entry.get_text().trim();
        if (text !== "") {
            let task = new TaskContainer(text, this._deleteTask.bind(this), this._onTaskClicked.bind(this), this._taskPreview);
            this._listBox.add_child(task.getContainer());
            this._tasks.push(task);

            this._entry.set_text("");

            this._counter++;
            this._label.set_text(`${this._counter}`);

            this._saveTasks();
        }
    }

    _onTaskClicked(clickType, task) {
        if (clickType === 'single') {
            if (this._currentEntry) {
                this._saveCurrentEntry();
            }
        } else if (clickType === 'double') {
            this._editTask(task);
        } else if (clickType === 'dragstart') {
            this._beginDrag(task);
        }
    }

    _editTask(task) {
        if (this._currentEntry) {
            this._saveCurrentEntry();
        }

        let index = this._listBox.get_children().indexOf(task.getContainer());
        let label = task.getText();

        // The row and the edit entry have different CSS padding/borders,
        // so swapping between them would shift every row below -- pin the
        // entry to the row's actual measured height to avoid that.
        let rowHeight = task.getContainer().height;

        let entry = new St.Entry({
            can_focus: true,
            text: label,
            style_class: 'counter-entry',
            height: rowHeight
        });

        this._listBox.remove_child(task.getContainer());
        this._listBox.insert_child_at_index(entry, index);

        // Stops receiving hover events while detached from the list, so
        // clear any hover-triggered state (e.g. a stuck delete button)
        task.resetHoverState();

        this._currentEntry = entry;
        this._currentTask  = task;
        this._currentIndex = index;

        entry.clutter_text.connect('activate', () => {
            this._saveCurrentEntry();
        });

        this._entryFocusOutHandlerId = global.stage.connect('captured-event', this._handleFocusLoss.bind(this));

        entry.add_style_class_name('editing-entry');
        entry.grab_key_focus();
        entry.clutter_text.set_selection(0, -1);
    }

    // Begin dragging a task to reorder it. The row stays in place, dimmed,
    // while a drop-line indicator moves within the list to show where it
    // would land; nothing changes or gets saved until _endDrag() commits
    // it on release.
    _beginDrag(task) {
        let container = task.getContainer();
        if (!container || !container.get_stage()) {
            return;
        }

        // Guard against re-entry, e.g. a stray dragstart arriving twice
        if (this._draggedTask) {
            this._endDrag(false);
        }

        if (this._currentEntry) {
            this._saveCurrentEntry();
        }

        task.updateHoverState(false);

        this._draggedTask = task;
        container.opacity = 128;

        this._dragIndicator = new St.Widget({ style_class: 'task-drop-indicator', x_expand: true });

        // Escape-to-cancel stays event-driven -- key events aren't part of
        // the held-button input class that gets delayed in this environment
        this._dragMotionHandler = global.stage.connect('captured-event', (actor, event) => {
            if (event.type() === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
                this._endDrag(false);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Indicator position and drop detection are polled for the same
        // reason as TaskContainer._trackDragThreshold()
        this._dragPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
            let [, , mods] = global.get_pointer();
            if (!(mods & Clutter.ModifierType.BUTTON1_MASK)) {
                this._dragPollId = null;
                this._endDrag(true);
                return GLib.SOURCE_REMOVE;
            }
            this._updateDragIndicator();
            return GLib.SOURCE_CONTINUE;
        });

        this._updateDragIndicator();
    }

    // Removes the indicator first so _computeDropIndex() measures real
    // task positions, not ones skewed by the indicator's own slot.
    _updateDragIndicator() {
        if (this._dragIndicator.get_parent() === this._listBox) {
            this._listBox.remove_child(this._dragIndicator);
        }
        let [, y] = global.get_pointer();
        let index = this._computeDropIndex(y);
        this._listBox.insert_child_at_index(this._dragIndicator, index);
    }

    // Index (0..this._tasks.length) of the task the given stage-space y
    // falls before; this._tasks.length itself means "at the end".
    _computeDropIndex(pointerY) {
        for (let i = 0; i < this._tasks.length; i++) {
            let taskContainer = this._tasks[i].getContainer();
            let [, y1] = taskContainer.get_transformed_position();
            let [, height] = taskContainer.get_transformed_size();
            if (pointerY < y1 + height / 2) {
                return i;
            }
        }
        return this._tasks.length;
    }

    // Commits the reorder (and saves) if shouldCommit is true, otherwise
    // just cleans up and leaves everything where it started.
    _endDrag(shouldCommit) {
        if (!this._draggedTask) {
            return;
        }

        let task = this._draggedTask;
        this._draggedTask = null;

        if (this._dragMotionHandler !== null) {
            global.stage.disconnect(this._dragMotionHandler);
            this._dragMotionHandler = null;
        }
        if (this._dragPollId !== null) {
            GLib.Source.remove(this._dragPollId);
            this._dragPollId = null;
        }

        let dropIndex = null;
        if (shouldCommit) {
            let [, y] = global.get_pointer();
            dropIndex = this._computeDropIndex(y);
        }

        if (this._dragIndicator) {
            if (this._dragIndicator.get_parent()) {
                this._listBox.remove_child(this._dragIndicator);
            }
            this._dragIndicator.destroy();
            this._dragIndicator = null;
        }

        let container = task.getContainer();
        if (container) {
            container.opacity = 255;
        }

        if (dropIndex !== null) {
            let oldIndex = this._tasks.indexOf(task);
            // dropIndex assumed the dragged task still occupied oldIndex,
            // so removing it first shifts later indices down by one
            let adjustedIndex = dropIndex > oldIndex ? dropIndex - 1 : dropIndex;
            if (oldIndex !== -1 && adjustedIndex !== oldIndex) {
                this._tasks.splice(oldIndex, 1);
                this._tasks.splice(adjustedIndex, 0, task);

                this._listBox.remove_child(container);
                this._listBox.insert_child_at_index(container, adjustedIndex);

                this._saveTasks();
            }
        }
    }

    _deleteTask(task) {
        let index = this._tasks.indexOf(task);
        if (index !== -1) {
            this._tasks.splice(index, 1);
        }

        // Not getContainer().destroy() directly -- that skips signal/timer
        // cleanup and destroys the button mid its own 'clicked' handler.
        task.destroy();

        this._counter--;
        this._label.set_text(`${this._counter}`);

        this._saveTasks();
    }

    _handleFocusLoss(actor, event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            // get_source() can be null (e.g. a press on bare stage
            // background); treat that as "outside" the entry rather than
            // passing it to contains(), which rejects null.
            let target = event.get_source();
            let clickedInsideEntry = target !== null &&
                (target === this._currentEntry || this._currentEntry.contains(target));
            if (!clickedInsideEntry) {
                this._saveCurrentEntry();
            }
        }
    }

    _saveCurrentEntry() {
        if (!this._currentEntry) return;

        let newText = this._currentEntry.get_text().trim();
        if (newText !== "") {
            this._currentTask.setText(newText);
        }

        // Unparent synchronously (list looks right immediately), but defer
        // destroy() -- this can run from the entry's own 'activate' handler,
        // and destroying it mid-signal-emission is the same hazard
        // TaskContainer.destroy() avoids elsewhere. Tracked on `this`
        // (rather than a bare local) so disable() can cancel/finish it if
        // it runs first.
        this._entryPendingDestroy = this._currentEntry;
        this._listBox.remove_child(this._entryPendingDestroy);
        this._entryDestroyIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._entryPendingDestroy.destroy();
            this._entryPendingDestroy = null;
            this._entryDestroyIdleId = null;
            return GLib.SOURCE_REMOVE;
        });
        this._listBox.insert_child_at_index(this._currentTask.getContainer(), this._currentIndex);

        if (this._entryFocusOutHandlerId) {
            global.stage.disconnect(this._entryFocusOutHandlerId);
            this._entryFocusOutHandlerId = null;
        }

        this._currentEntry = null;
        this._currentTask  = null;
        this._currentIndex = null;

        this._saveTasks();
    }

    // Shared logger for the file-I/O error paths below, rather than
    // scattering near-duplicate error-logging calls across each of them.
    _logFileError(operation, error) {
        console.error(`Jinni: failed to ${operation}: ${error.message}`);
    }

    _saveTasks() {
        if (!this._settings.get_boolean('persist-tasks')) {
            return;
        }

        // A task currently being edited still reports its last-committed
        // text via getText(), so it's saved rather than dropped if this
        // runs mid-edit.
        let tasks = this._tasks.map(task => task.getText()).filter(text => text !== '');

        let file = Gio.File.new_for_path(this._tasksFilePath);

        let parentDir = file.get_parent();
        if (parentDir && !parentDir.query_exists(null)) {
            parentDir.make_directory_with_parents(null);
        }

        // Async, not the sync replace_contents(): shell code shouldn't
        // block on file I/O. Unlike the sync call, the async one requires
        // a GLib.Bytes rather than accepting a raw string. The callback
        // doesn't touch any extension state that disable() could have
        // nulled by the time it runs, so no cancellable is needed here
        // (unlike _loadTasks() below).
        let bytes = new GLib.Bytes(new TextEncoder().encode(JSON.stringify(tasks)));
        file.replace_contents_async(
            bytes,
            null,  // etag
            false, // make_backup
            Gio.FileCreateFlags.NONE,
            null,  // cancellable
            (source, result) => {
                try {
                    source.replace_contents_finish(result);
                } catch (error) {
                    this._logFileError('save tasks to file', error);
                }
            }
        );
    }

    _loadTasks() {
        if (!this._settings.get_boolean('persist-tasks')) {
            this._clearTasksFile();
            this._counter = 0;
            this._label.set_text(`${this._counter}`);
            return;
        }

        let file = Gio.File.new_for_path(this._tasksFilePath);
        if (!file.query_exists(null)) {
            // Nothing saved yet (e.g. first run) -- not an error
            return;
        }

        // Async, not the sync GLib.file_get_contents(): shell code
        // shouldn't block on file I/O. Cancelled in disable() since the
        // success path below touches _listBox/_tasks/_label, which could
        // otherwise be null by the time this fires.
        this._loadCancellable = new Gio.Cancellable();
        file.load_contents_async(this._loadCancellable, (source, result) => {
            try {
                let [success, contents] = source.load_contents_finish(result);
                if (success && this._listBox) {
                    let contentsString = new TextDecoder().decode(contents);
                    let tasks = JSON.parse(contentsString);
                    tasks.forEach(taskText => {
                        let task = new TaskContainer(taskText, this._deleteTask.bind(this), this._onTaskClicked.bind(this), this._taskPreview);
                        this._listBox.add_child(task.getContainer());
                        this._tasks.push(task);
                    });
                    this._counter = tasks.length;
                    this._label.set_text(`${this._counter}`);
                }
            } catch (error) {
                if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    this._logFileError('load tasks from file', error);
                }
            }
            this._loadCancellable = null;
        });
    }

    _clearTasksFile() {
        try {
            let file = Gio.File.new_for_path(this._tasksFilePath);
            if (file.query_exists(null)) {
                file.delete(null);
            }
        } catch (error) {
            this._logFileError('clear tasks file', error);
        }
    }
}
