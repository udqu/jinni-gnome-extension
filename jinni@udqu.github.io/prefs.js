import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class JinniPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        // General group
        const generalGroup = new Adw.PreferencesGroup({ title: 'General' });
        page.add(generalGroup);

        const widthRow = new Adw.SpinRow({
            title: 'Task List Window Width',
            subtitle: 'Width of the task list popup, in pixels',
            adjustment: new Gtk.Adjustment({ lower: 50, upper: 500, step_increment: 10 }),
        });
        settings.bind('tasklist-window-width', widthRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(widthRow);

        const persistRow = new Adw.SwitchRow({
            title: 'Persist Tasks Across Sessions',
            subtitle: 'Save and reload tasks when GNOME Shell restarts or the extension is disabled',
        });
        settings.bind('persist-tasks', persistRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(persistRow);

        // Task preview group
        const previewGroup = new Adw.PreferencesGroup({
            title: 'Task Previews',
            description: 'Show a popup with the full task text on hover',
        });
        page.add(previewGroup);

        const enablePreviewsRow = new Adw.SwitchRow({ title: 'Enable Task Previews' });
        settings.bind('enable-previews', enablePreviewsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        previewGroup.add(enablePreviewsRow);

        const maxPreviewSizeRow = new Adw.SpinRow({
            title: 'Preview Window Width',
            subtitle: 'Maximum width of the preview popup, in pixels',
            adjustment: new Gtk.Adjustment({ lower: 100, upper: 500, step_increment: 50 }),
        });
        settings.bind('max-preview-size', maxPreviewSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        previewGroup.add(maxPreviewSizeRow);

        const hoverTimeRow = new Adw.SpinRow({
            title: 'Hover Time',
            subtitle: 'Delay before the preview appears, in milliseconds',
            adjustment: new Gtk.Adjustment({ lower: 100, upper: 5000, step_increment: 100 }),
        });
        settings.bind('hover-time', hoverTimeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        previewGroup.add(hoverTimeRow);

        // Keep the size rows in step with whether previews are enabled
        settings.bind('enable-previews', maxPreviewSizeRow, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('enable-previews', hoverTimeRow, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
    }
}
