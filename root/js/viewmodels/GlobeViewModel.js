/*
 * The MIT License - http://www.opensource.org/licenses/mit-license
 * Copyright (c) 2016 Bruce Schubert.
 */

/*global WorldWind*/

/**
 * 
 * @param {type} ko
 * @param {type} $
 * @param {type} jqueryui
 * @param {type} BasicMarker
 * @param {type} explorer
 * @param {type} util
 * @param {type} WeatherScout
 * @param {type} ww
 * @returns {GlobeViewModelL#18.GlobeViewModel}
 */
define([
    'knockout',
    'jquery',
    'jqueryui',
    'model/markers/BasicMarker',
    'model/Explorer',
    'model/util/WmtUtil',
    'model/weather/WeatherScout',
    'worldwind'], function (
    ko,
    $,
    jqueryui,
    BasicMarker,
    explorer,
    util,
    WeatherScout,
    ww) {
    "use strict";
    /**
     *
     * @param {Globe} globe The globe object
     * @param {Array} params Array containing markerManager and weatherManager objects
     * @constructor
     */
    function GlobeViewModel(globe, params, viewElementId, viewUrl, appendToId) {
        var self = this;

        this.view = null;
        this.globe = globe;
        this.markerManager = params.markerManager;
        this.weatherManager = params.weatherManager;

        // Save a reference to the auto-update time observable for the view view
        this.autoUpdateTime = explorer.autoUpdateTimeEnabled;

        // Create the marker templates used in the marker palette
        this.markerPalette = ko.observableArray(BasicMarker.templates);
        // The currently selected marker icon in the marker palette
        this.selectedMarkerTemplate = ko.observable(this.markerPalette()[0]);
        
        // Used for cursor style and click handling (see Globe's canvas in index.html)
        this.dropIsArmed = ko.observable(false);
        // The dropCallback is supplied with the click position and the dropObject.
        this.dropCallback = null;
        // The object passed to the dropCallback
        this.dropObject = null;


        this.intervalMinutes = 0;
        this.timeSliderValue = ko.observable(0);

        // Assign the click handlers to the WorldWindow
        this.globe.wwd.addEventListener('click', function (event) {
            self.handleDropClick(event);
        });
        
        this.globe.wwd.addEventListener("touchend", function (event) {
            self.handleDropClick(event);
        });

        //
        // Load the view html into the DOM and apply the Knockout bindings
        //
        $.ajax({
            async: false,
            dataType: 'html',
            url: viewUrl,
            success: function (data) {
                // Load the view html into the specified DOM element
                $("#" + appendToId).append(data);

                // Update the view member
                self.view = document.getElementById(viewElementId);

                // Binds the view to this view model.
                ko.applyBindings(self, self.view);
            }
        });

        //$("#timeControlSlider").on('mousedown', $.proxy(this.onMousedown, this));
        //$("#timeControlSlider").on('mouseup', $.proxy(this.onMouseup, this));
        // The slide event provides events from the keyboard
        $("#timeControlSlider").on('slide', $.proxy(this.onSlide, this));
        $('#timeControlSlider').slider({
            animate: 'fast',
            min: -60,
            max: 60,
            orientation: 'horizontal',
            stop: function () {
                $("#timeControlSlider").slider("value", "0");
            }
        });

        // The time-control buttons have the repeatButton style:
        // This handler performs the time adjustment for both the
        // single click and repeat clicks.
        var intervalId = -1;
        $(".repeatButton").mousedown(function (event) {
            switch (event.currentTarget.id) {
                case "time-step-forward":
                    self.intervalMinutes = 60;
                    break;
                case "time-fast-forward":
                    self.intervalMinutes = 60 * 24;
                    break;
                case "time-step-backward":
                    self.intervalMinutes = -60;
                    break;
                case "time-fast-backward":
                    self.intervalMinutes = -60 * 24;
                    break;
            }
            self.changeDateTime();
            // Start a repeating interval that changes the time.
            if (intervalId !== -1) {    // prevent duplicates
                clearInterval(intervalId);
            }
            intervalId = setInterval(self.changeDateTime, 200);
        }).mouseup(function () {
            clearInterval(intervalId);
            intervalId = -1;
        });
        
        // Invoke armDropMarker when a template is selected from the palette
        this.selectedMarkerTemplate.subscribe(this.armDropMarker);


    }

    /**
     * Arms the click-drop handler to add a marker to the globe. See: handleClick below.
     */
    GlobeViewModel.prototype.armDropMarker = function () {
        this.dropIsArmed(true);
        this.dropCallback = this.dropMarkerCallback;
        this.dropObject = this.selectedMarkerTemplate();
    };
    
    /**
     * Arms the click-drop handler to add a weather scout to the globe. See: handleClick below.
     */
    GlobeViewModel.prototype.armDropScout = function () {
        this.dropIsArmed(true);
        this.dropCallback = this.dropScoutCallback;
        this.dropObject = null;
    };


    // This "Drop" action callback creates and adds a marker to the globe
    // when the globe is clicked while dropIsArmed is true.
    GlobeViewModel.prototype.dropMarkerCallback = function (position, markerTemplate) {
        // Add the placemark to the layer and to the observable array
        this.markerManager.addMarker(new BasicMarker(
            this.markerManager, position, {imageSource: markerTemplate.imageSource}));
    };

    // This "Drop" action callback creates and adds a weather scout to the globe
    // when the globe is clicked while dropIsArmed is true.
    GlobeViewModel.prototype.dropScoutCallback = function (position) {
        this.weatherManager.addScout(new WeatherScout(this.weatherManager, position));
    };

    /**
     * Handles a click on the WorldWindow. If a "drop" action callback has been
     * defined, it invokes the dropCallback function with the picked location.
     */
    GlobeViewModel.prototype.handleDropClick = function (event) {
        if (!this.dropIsArmed()) {
            return;
        }
        var type = event.type,
            x, y,
            pickList,
            terrain;
        // Get the clicked window coords
        switch (type) {
            case 'click':
                x = event.clientX;
                y = event.clientY;
                break;
            case 'touchend':
                if (!event.changedTouches[0]) {
                    return;
                }
                x = event.changedTouches[0].clientX;
                y = event.changedTouches[0].clientY;
                break;
        }
        if (this.dropCallback) {
            // Get all the picked items
            pickList = this.globe.wwd.pickTerrain(this.globe.wwd.canvasCoordinates(x, y));
            // Terrain should be one of the items if the globe was clicked
            terrain = pickList.terrainObject();
            if (terrain) {
                this.dropCallback(terrain.position, this.dropObject);
            }
        }
        this.dropIsArmed(false);
        event.stopImmediatePropagation();
    };

    GlobeViewModel.prototype.onTimeReset = function () {
        explorer.autoUpdateTimeEnabled(true);   // reset enables the auto time adjustment
        this.globe.updateDateTime(new Date());
    };

    GlobeViewModel.prototype.changeDateTime = function () {
        explorer.autoUpdateTimeEnabled(false);  // stop the auto adjustment when we manually set the time
        this.globe.incrementDateTime(this.intervalMinutes);
    };

    GlobeViewModel.prototype.onSlide = function (event, ui) {
        //console.log("onSlide: " + ui.value);
        explorer.autoUpdateTimeEnabled(false);  // stop the auto time adjustment whenever we manually set the time
        this.globe.incrementDateTime(ui.value);
        //globe.incrementDateTime(self.sliderValueToMinutes(ui.value));
        this.globe.updateDateTime(this.sliderValueToTime(ui.value));
    };

    GlobeViewModel.prototype.sliderValueToTime = function (value) {
        var time = this.globe.dateTime(),
            minutes = time.getMinutes();
        time.setTime(time.getTime() + (value * 60000));
        return time;
    };

    GlobeViewModel.prototype.sliderValueToMinutes = function (value) {
        var val, factor = 50;
        if (value < 45 && value > -45) {
            val = Math.min(Math.max(value, -45), 45);
            return Math.sin(val * util.DEG_TO_RAD) * factor;
        }
        val = Math.abs(value) - 44;
        return Math.pow(val, 1.5) * (value < 0 ? -1 : 1) * factor;
    };

    GlobeViewModel.prototype.onTimeSliderStop = function () {
        this.timeSliderValue(0);
    };

    return GlobeViewModel;
});