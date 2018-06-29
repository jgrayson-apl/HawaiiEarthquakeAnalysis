/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/date/locale",
  "dojo/number",
  "dojo/on",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/views/MapView",
  "esri/layers/Layer",
  "esri/layers/FeatureLayer",
  "esri/tasks/support/StatisticDefinition",
  "esri/geometry/Extent",
  "esri/geometry/geometryEngine",
  "esri/widgets/Feature",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/LayerList",
  "esri/widgets/Legend",
  "esri/widgets/Print",
  "esri/widgets/ScaleBar",
  "esri/widgets/Compass",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand"
], function (calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
             Color, colors, locale, number, on, query, dom, domClass, domConstruct,
             IdentityManager, Evented, watchUtils, promiseUtils, Portal, MapView, Layer, FeatureLayer, StatisticDefinition,
             Extent, geometryEngine, Feature, Home, Search, LayerList, Legend, Print, ScaleBar, Compass, BasemapGallery, Expand) {


  // CONVERT DATE TO VALID AGS DATE/TIME STRING //
  Date.prototype.toAGSDateTimeString = function (useLocal) {
    if(!useLocal) {
      return this.getUTCFullYear() +
          '-' + String(this.getUTCMonth() + 1).padStart(2, "0") +
          '-' + String(this.getUTCDate()).padStart(2, "0") +
          ' ' + String(this.getUTCHours()).padStart(2, "0") +
          ':' + String(this.getUTCMinutes()).padStart(2, "0") +
          ':' + String(this.getUTCSeconds()).padStart(2, "0");
    } else {
      return this.getFullYear() +
          '-' + String(this.getMonth() + 1).padStart(2, "0") +
          '-' + String(this.getDate()).padStart(2, "0") +
          ' ' + String(this.getHours()).padStart(2, "0") +
          ':' + String(this.getMinutes()).padStart(2, "0") +
          ':' + String(this.getSeconds()).padStart(2, "0");
    }
  };

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      this.CSS = {
        loading: "configurable-application--loading",
        NOTIFICATION_TYPE: {
          MESSAGE: "alert alert-blue animate-in-up is-active inline-block",
          SUCCESS: "alert alert-green animate-in-up is-active inline-block",
          WARNING: "alert alert-yellow animate-in-up is-active inline-block",
          ERROR: "alert alert-red animate-in-up is-active inline-block"
        },
      };
      this.base = null;
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if(!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function (response) {
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem) {
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "scene-container";

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          itemUtils.findQuery(find, view).then(() => {
            itemUtils.goToMarker(marker, view).then(() => {
              domClass.remove(document.body, this.CSS.loading);
              view.when(() => {
                this.viewReady(config, firstItem, view);
              });
            });
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function (config, item, view) {

      // TITLE //
      const title_node = domConstruct.create("div", {
        className: "panel panel-dark-blue font-size-3",
        innerHTML: config.title
      });
      view.ui.add(title_node, { position: "top-left", index: 0 });

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });


      // USER SIGN IN //
      this.initializeUserSignIn(view).always(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // SEARCH //
        const search = new Search({ view: view, searchTerm: this.base.config.search || "" });
        view.ui.add(search, { position: "top-left", index: 1 });

        // BASEMAPS //
        const basemapGalleryExpand = new Expand({
          view: view,
          content: new BasemapGallery({ view: view }),
          expandIconClass: "esri-icon-basemap",
          expandTooltip: "Basemap"
        });
        view.ui.add(basemapGalleryExpand, { position: "top-left", index: 4 });

        // PLACES //
        this.initializePlaces(view);

        this.initializeUndergroundDisplay(view);

        this.initializeHawaiiEarthquakeAnalysis(view);

      });

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function (view) {

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          return promiseUtils.resolve();
        }).otherwise(console.warn);
      };

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     */
    initializePlaces: function (view) {

      // WEB SCENE //
      if(view.map.presentation && view.map.presentation.slides && (view.map.presentation.slides.length > 0)) {
        // PLACES PANEL //
        const placesPanel = domConstruct.create("div", { className: "places-panel panel panel-no-padding esri-widget" });
        const placesExpand = new Expand({
          view: view,
          content: placesPanel,
          expandIconClass: "esri-icon-applications",
          expandTooltip: "Places"
        }, domConstruct.create("div"));
        view.ui.add(placesExpand, "bottom-left");

        // SLIDES //
        const slides = view.map.presentation.slides;
        slides.forEach((slide) => {

          const slideNode = domConstruct.create("div", { className: "places-node esri-interactive" }, placesPanel);
          domConstruct.create("img", { className: "", src: slide.thumbnail.url }, slideNode);
          domConstruct.create("span", { className: "places-label", innerHTML: slide.title.text }, slideNode);

          on(slideNode, "click", () => {
            slide.applyTo(view, {
              animate: true,
              speedFactor: 0.33,
              easing: "in-out-cubic"   // linear, in-cubic, out-cubic, in-out-cubic, in-expo, out-expo, in-out-expo
            }).then(() => {
              placesExpand.collapse();
            });
          });
        });

        view.on("layerview-create", (evt) => {
          if(evt.layer.visible) {
            slides.forEach((slide) => {
              slide.visibleLayers.add({ id: evt.layer.id });
            });
          }
        });
      } else {
        // WEB MAP //
        if(view.map.bookmarks && view.map.bookmarks.length > 0) {

          // PLACES DROPDOWN //
          const placesDropdown = domConstruct.create("div", { className: "dropdown js-dropdown esri-widget" });
          view.ui.add(placesDropdown, { position: "top-left", index: 1 });
          const placesBtn = domConstruct.create("button", {
            className: "btn btn-transparent dropdown-btn js-dropdown-toggle",
            "tabindex": "0", "aria-haspopup": "true", "aria-expanded": "false",
            innerHTML: "Places"
          }, placesDropdown);
          domConstruct.create("span", { className: "icon-ui-down" }, placesBtn);
          // MENU //
          const placesMenu = domConstruct.create("nav", { className: "dropdown-menu modifier-class" }, placesDropdown);

          // BOOKMARKS //
          view.map.bookmarks.forEach((bookmark) => {
            // MENU ITEM //
            const bookmarkNode = domConstruct.create("div", {
              className: "dropdown-link",
              role: "menu-item",
              innerHTML: bookmark.name
            }, placesMenu);
            on(bookmarkNode, "click", () => {
              view.goTo({ target: Extent.fromJSON(bookmark.extent) });
            });
          });

          // INITIALIZE CALCITE DROPDOWN //
          calcite.dropdown();
        }
      }

    },

    /**
     *
     * @param view
     */
    initializeHawaiiEarthquakeAnalysis: function (view) {

      //
      // THIS ITEM POINTS TO A SERVICE WITH MULTIPLE LAYERS SO A GROUP LAYER IS RETURNED //
      //
      Layer.fromPortalItem({ portalItem: { id: "75d690620dfd46b893e65b4548409d52" } }).then((hawaii_earthquake_analysis_layer) => {
        hawaii_earthquake_analysis_layer.load().then(() => {
          // ADD GROUP LAYER TO MAP //
          view.map.add(hawaii_earthquake_analysis_layer);

          // CHILD LAYERS OF A GROUP LAYER NEED TO LOADED BEFORE YOU CAN CHECK THE TITLES //
          const layers_to_hide = ["Major Roads"];
          promiseUtils.eachAlways(hawaii_earthquake_analysis_layer.layers.map(layer => {
            return layer.load().then(() => {
              // OVERRIDE VISIBILITY //
              layer.visible = !layers_to_hide.includes(layer.title);
            });
          })).then(() => {

            // LAVA LAYER //
            const lava_layer = hawaii_earthquake_analysis_layer.layers.find(layer => {
              return (layer.title === "Lava Flow Over Time");
            });

            // EARTHQUAKES LAYER //
            const earthquakes_layer = hawaii_earthquake_analysis_layer.layers.find(layer => {
              return (layer.title === "Earthquakes 06182018");
            });
            hawaii_earthquake_analysis_layer.layers.reorder(earthquakes_layer, hawaii_earthquake_analysis_layer.layers.length - 1);
            earthquakes_layer.definitionExpression = "depth_neg < 0.0";
            earthquakes_layer.elevationInfo = {
              mode: "absolute-height",
              featureExpressionInfo: {
                expression: "$feature.depth_neg",
              },
              unit: "kilometers"
            };

            // PARCELS LAYER //
            const parcels_layer = hawaii_earthquake_analysis_layer.layers.find(layer => {
              return (layer.title === "Zoning Parcels");
            });
            parcels_layer.opacity = 0.8;

            // GET COMBINED TIME EXTENT //
            this.getLayerTimeExtent(lava_layer, "FieldTime").then((lava_time_stats) => {
              // this.getLayerTimeExtent(earthquakes_layer, "date_time").then((quakes_time_stats) => {
              const time_extent = {
                min: new Date(lava_time_stats.min),
                max: new Date(lava_time_stats.max)
                //min: new Date(Math.min(lava_time_stats.min, quakes_time_stats.min))
                //max: new Date(Math.max(lava_time_stats.max, quakes_time_stats.max))
              };

              // INITIALIZE EARTHQUAKE RENDERER //
              this.createEarthquakeRenderer = this.initializeEarthquakeRenderer(earthquakes_layer.renderer, "Date_Time");

              // UPDATE RENDERERS //
              const update_renderers = (date_time_value) => {
                lava_layer.renderer = this.createLavaRenderer(date_time_value);
                earthquakes_layer.renderer = this.createEarthquakeRenderer(date_time_value);
              };
              // SET INITIAL RENDERERS BASED ON MIN TIME //
              update_renderers(lava_time_stats.min);

              // TIME CHANGE //
              this.on("time-change", evt => {
                update_renderers(evt.dateTimeValue);
              });

              // INITIALIZE MAP VIEW AND STATS //
              this.initializeMapViewAndStats(view, lava_layer, earthquakes_layer, parcels_layer, lava_time_stats.min).then(() => {
                // INITIALIZE TIME FILTER //
                this.initializeTimeFilter(view, time_extent);
              });
              // });
            });
          });
        });
      });

    },

    /**
     *
     * @param view
     * @param lava_layer
     * @param earthquakes_layer
     * @param parcels_layer
     * @param time_min_value
     */
    initializeMapViewAndStats: function (view, lava_layer, earthquakes_layer, parcels_layer, time_min_value) {

      const map_view = new MapView({
        container: "map-container",
        map: view.map,
        ui: { components: ["zoom"] },
        viewpoint: view.viewpoint
      });
      return map_view.when(() => {

        // LOADING //
        const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
        domConstruct.create("div", { className: "loader-bars" }, updating_node);
        domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
        map_view.ui.add(updating_node, "bottom-right");
        watchUtils.init(map_view, "updating", (updating) => {
          domClass.toggle(updating_node, "is-active", updating);
        });

        //
        // LAYER LIST //
        //
        // CREATE OPACITY NODE //
        const createOpacityNode = (item, parent_node) => {
          const opacity_node = domConstruct.create("div", { className: "opacity-node esri-widget", title: "Layer Opacity" }, parent_node);
          // domConstruct.create("span", { className: "font-size--3", innerHTML: "Opacity:" }, opacity_node);
          const opacity_input = domConstruct.create("input", { className: "opacity-input", type: "range", min: 0, max: 1.0, value: item.layer.opacity, step: 0.01 }, opacity_node);
          on(opacity_input, "input", () => {
            item.layer.opacity = opacity_input.valueAsNumber;
          });
          item.layer.watch("opacity", (opacity) => {
            opacity_input.valueAsNumber = opacity;
          });
          opacity_input.valueAsNumber = item.layer.opacity;
          return opacity_node;
        };
        // CREATE TOOLS NODE //
        const createToolsNode = (item, parent_node) => {
          // TOOLS NODE //
          const tools_node = domConstruct.create("div", { className: "opacity-node esri-widget" }, parent_node);

          // REORDER //
          const reorder_node = domConstruct.create("div", { className: "inline-block" }, tools_node);
          const reorder_up_node = domConstruct.create("button", { className: "btn-link icon-ui-up", title: "Move layer up..." }, reorder_node);
          const reorder_down_node = domConstruct.create("button", { className: "btn-link icon-ui-down", title: "Move layer down..." }, reorder_node);
          on(reorder_up_node, "click", () => {
            map_view.map.reorder(item.layer, map_view.map.layers.indexOf(item.layer) + 1);
          });
          on(reorder_down_node, "click", () => {
            map_view.map.reorder(item.layer, map_view.map.layers.indexOf(item.layer) - 1);
          });

          // REMOVE LAYER //
          const remove_layer_node = domConstruct.create("button", { className: "btn-link icon-ui-close right", title: "Remove layer from map..." }, tools_node);
          on.once(remove_layer_node, "click", () => {
            map_view.map.remove(item.layer);
            this.emit("layer-removed", item.layer);
          });

          // ZOOM TO //
          const zoom_to_node = domConstruct.create("button", { className: "btn-link icon-ui-zoom-in-magnifying-glass right", title: "Zoom to Layer" }, tools_node);
          on(zoom_to_node, "click", () => {
            map_view.goTo(item.layer.fullExtent);
          });

          // LAYER DETAILS //
          const itemDetailsPageUrl = `${this.base.portal.url}/home/item.html?id=${item.layer.portalItem.id}`;
          domConstruct.create("a", { className: "btn-link icon-ui-description icon-ui-blue right", title: "View details...", target: "_blank", href: itemDetailsPageUrl }, tools_node);

          return tools_node;
        };
        // LAYER LIST //
        const layerList = new LayerList({
          view: view,
          listItemCreatedFunction: (evt) => {
            let item = evt.item;
            if(item.layer && item.layer.portalItem) {

              // CREATE ITEM PANEL //
              const panel_node = domConstruct.create("div", { className: "esri-widget" });

              // LAYER TOOLS //
              createToolsNode(item, panel_node);

              // OPACITY //
              createOpacityNode(item, panel_node);

              // if(item.layer.type === "imagery") {
              //   this.configureImageryLayer(view, item.layer, panel_node);
              // }

              // LEGEND //
              if(item.layer.legendEnabled) {
                const legend = new Legend({ container: panel_node, view: view, layerInfos: [{ layer: item.layer }] })
              }

              // SET ITEM PANEL //
              item.panel = {
                title: "Settings",
                className: "esri-icon-settings",
                content: panel_node
              };
            }
          }
        });
        map_view.ui.add(layerList, { position: "top-right", index: 0 });

        return map_view.whenLayerView(lava_layer).then((lava_layerView) => {
          return map_view.whenLayerView(earthquakes_layer).then((earthquakes_layerView) => {
            return map_view.whenLayerView(parcels_layer).then((parcels_layerView) => {

              // LAVA STATS //
              this.updateLavaStats = this.initializeLavaStats(lava_layerView, "FieldTime");
              // EARTHQUAKE STATS //
              this.updateQuakeStats = this.initializeEarthquakeStats(earthquakes_layerView, "date_time");
              // PARCEL HIGHLIGHT //
              this.highlightIntersction = this.initializeHighlight(parcels_layerView);

              this.on("time-change", evt => {
                this.updateLavaStats(evt.dateTimeValue);
                this.updateQuakeStats(evt.dateTimeValue);
              });

              // SYNC VIEWS //
              this.syncViews([view, map_view]);

              return promiseUtils.eachAlways([
                watchUtils.whenFalseOnce(lava_layerView, "updating"),
                watchUtils.whenFalseOnce(earthquakes_layerView, "updating"),
                watchUtils.whenFalseOnce(parcels_layerView, "updating")
              ]);

            });
          });
        });
      });

    },

    /**
     *
     * @param views
     */
    syncViews: function (views) {

      const synchronizeView = (view, others) => {
        others = Array.isArray(others) ? others : [others];

        let viewpointWatchHandle;
        let viewStationaryHandle;
        let otherInteractHandlers;
        let scheduleId;

        const clear = () => {
          if(otherInteractHandlers) {
            otherInteractHandlers.forEach((handle) => {
              handle.remove();
            });
          }
          viewpointWatchHandle && viewpointWatchHandle.remove();
          viewStationaryHandle && viewStationaryHandle.remove();
          scheduleId && clearTimeout(scheduleId);
          otherInteractHandlers = viewpointWatchHandle = viewStationaryHandle = scheduleId = null;
        };

        const interactWatcher = view.watch('interacting,animation', (newValue) => {
          if(!newValue) { return; }
          if(viewpointWatchHandle || scheduleId) { return; }

          if(!view.animation) {
            others.forEach((otherView) => {
              otherView.viewpoint = view.viewpoint;
            });
          }

          // start updating the other views at the next frame
          scheduleId = setTimeout(() => {
            scheduleId = null;
            viewpointWatchHandle = view.watch('viewpoint', (newValue) => {
              others.forEach((otherView) => {
                otherView.viewpoint = newValue;
              });
            });
          }, 0);

          // stop as soon as another view starts interacting, like if the user starts panning
          otherInteractHandlers = others.map((otherView) => {
            return watchUtils.watch(otherView, 'interacting,animation', (value) => {
              if(value) { clear(); }
            });
          });

          // or stop when the view is stationary again
          viewStationaryHandle = watchUtils.whenTrue(view, 'stationary', clear);

          // initial sync //
          others.forEach((otherView) => {
            otherView.viewpoint = view.viewpoint;
          });

        });

        return {
          remove: () => {
            this.remove = () => {
            };
            clear();
            interactWatcher.remove();
          }
        }
      };

      const synchronizeViews = (views) => {
        let handles = views.map((view, idx, views) => {
          const others = views.concat();
          others.splice(idx, 1);
          return synchronizeView(view, others);
        });

        return {
          remove: () => {
            this.remove = () => {
            };
            handles.forEach((h) => {
              h.remove();
            });
            handles = null;
          }
        }
      };
      synchronizeViews(views);

    },

    /**
     *
     * @param layerView
     * @param time_field
     * @returns {*}
     */
    initializeLavaStats: function (layerView, time_field) {

      const lava_area_node = dom.byId("lava-acres");

      let query_handle = null;
      return (date_time_value) => {
        query_handle && (!query_handle.isFulfilled()) && query_handle.cancel();

        const acres_query = layerView.layer.createQuery();
        acres_query.outFields = [time_field];
        acres_query.where = `${time_field} < timestamp '${(new Date(date_time_value)).toAGSDateTimeString()}'`;
        query_handle = layerView.queryFeatures(acres_query).then((lava_featureSet) => {

          const lava_polygons = lava_featureSet.features.map(lava_feature => {
            return lava_feature.geometry.clone();
          });
          const lava_polygon = geometryEngine.union(lava_polygons);
          const acres = geometryEngine.geodesicArea(lava_polygon, "acres");
          lava_area_node.innerHTML = isNaN(acres) ? "-.-" : number.format(acres, { places: 1 });

          this.highlightIntersction(lava_polygon);

        }, console.error);

      };

    },

    /**
     *
     * @param layerView
     * @param time_field
     * @returns {*}
     */
    initializeEarthquakeStats: function (layerView, time_field) {

      const quake_count_node = dom.byId("quake-count");
      const one_hour = (1000 * 60 * 60);

      let query_handle = null;
      return (date_time_value) => {
        query_handle && (!query_handle.isFulfilled()) && query_handle.cancel();

        const from_date = (new Date(date_time_value - (one_hour * 12))).toAGSDateTimeString();
        const to_date = (new Date(date_time_value + (one_hour * 12))).toAGSDateTimeString();

        const count_query = layerView.layer.createQuery();
        count_query.outFields = [time_field];
        count_query.where = `(${time_field} > timestamp '${from_date}') AND (${time_field} < timestamp '${to_date}')`;
        query_handle = layerView.queryFeatureCount(count_query).then((quake_count) => {
          quake_count_node.innerHTML = isNaN(quake_count) ? "-" : number.format(quake_count, { places: 0 });
        }, console.error);

      };

    },

    /**
     *
     * @param layer
     * @param time_field
     * @returns {Promise}
     */
    getLayerTimeExtent: function (layer, time_field) {

      const time_min_stat = new StatisticDefinition({
        statisticType: "min",
        onStatisticField: time_field,
        outStatisticFieldName: "time_min"
      });
      const time_max_stat = new StatisticDefinition({
        statisticType: "max",
        onStatisticField: time_field,
        outStatisticFieldName: "time_max"
      });

      const time_query = layer.createQuery();
      time_query.outStatistics = [time_min_stat, time_max_stat];
      return layer.queryFeatures(time_query).then(stats_features => {
        const time_stats = stats_features.features[0].attributes;
        return {
          min: time_stats.time_min,
          max: time_stats.time_max
        };
      });

    },

    /**
     *
     * @param view
     * @param timeExtent
     */
    initializeTimeFilter: function (view, timeExtent) {

      const current_time_info = {
        min: timeExtent.min,
        max: timeExtent.max
      };

      const format_date = (date_time) => {
        return locale.format(date_time, { datePattern: "MMMM d", timePattern: "h:mm a" });
      };

      dom.byId("current-time-node").innerHTML = format_date(current_time_info.min);
      dom.byId("time-range-node").innerHTML = `${format_date(current_time_info.min)}&nbsp;&nbsp;&nbsp;to&nbsp;&nbsp;&nbsp;${format_date(current_time_info.max)}`;

      const time_input = dom.byId("time-input");
      time_input.min = current_time_info.min.valueOf();
      time_input.max = current_time_info.max.valueOf();
      time_input.valueAsNumber = time_input.min;
      domClass.remove(time_input, "btn-disabled");

      on(time_input, "input", () => {
        update_time_filter();
      });
      on(time_input, "change", () => {
        update_time_filter();
      });

      const set_time = (date_time) => {
        time_input.valueAsNumber = date_time;
        update_time_filter();
      };

      const update_time_filter = () => {
        dom.byId("current-time-node").innerHTML = format_date(new Date(time_input.valueAsNumber));
        this.emit("time-change", { dateTimeValue: time_input.valueAsNumber })
      };

      update_time_filter();

      //
      // ANIMATION STUFF //
      //

      let animation;

      function startAnimation() {
        stopAnimation();
        domClass.add(time_input, "btn-disabled");
        animation = animate(parseFloat(time_input.value));
      }

      function stopAnimation() {
        if(!animation) {
          return;
        }
        animation.remove();
        animation = null;
        domClass.remove(time_input, "btn-disabled");
      }

      function animate(startValue) {
        let animating = true;
        let value = startValue;

        const one_hour = (1000 * 60 * 60);

        const frame = () => {
          if(!animating) {
            return;
          }
          value += (one_hour * 3);
          if(value > current_time_info.max.valueOf()) {
            value = current_time_info.min.valueOf();
          }
          set_time(value);
          setTimeout(() => {
            requestAnimationFrame(frame);
          }, 1000 / 30);
        };

        frame();

        return {
          remove: function () {
            animating = false;
          }
        };
      }

      const play_pause_btn = dom.byId("play-pause-btn");
      on(play_pause_btn, "click", () => {
        domClass.toggle(play_pause_btn, "icon-ui-play icon-ui-pause icon-ui-green icon-ui-red");
        if(domClass.contains(play_pause_btn, "icon-ui-play")) {
          stopAnimation();
        } else {
          startAnimation();
        }
      })

    },

    /**
     *
     * @param date_time_value
     * @returns {*}
     */
    createLavaRenderer: function (date_time_value) {

      const one_hour = (1000 * 60 * 60);

      return {
        type: "simple",
        symbol: {
          type: "simple-fill",
          style: "solid",
          color: Color.named.black,
          outline: {
            type: "simple-line",
            style: "solid",
            color: Color.named.transparent,
            width: "3px",
            cap: "round",
            join: "round"
          }
        },
        visualVariables: [
          {
            "type": "color",
            "field": "FieldTime",
            "valueExpression": null,
            "stops": [
              { "value": date_time_value - (one_hour * 24), "color": "#555" },
              { "value": date_time_value, "color": Color.named.red }
            ]
          },
          {
            type: "opacity",
            field: "FieldTime",
            stops: [
              /*{
                label: "previous",
                opacity: 0.0,
                value: 1
              },*/
              /*{
                label: "-24 hours",
                opacity: 0.1,
                value: date_time_value - (one_hour * 24)
              },*/
              /*{
                label: "-3 hours",
                opacity: 0.5,
                value: date_time_value - (one_hour * 3)
              },*/
              {
                label: "now",
                opacity: 1.0,
                value: date_time_value // - (one_hour * 24)
              },
              {
                label: "+12 hours",
                opacity: 0.0,
                value: date_time_value + (one_hour * 12)
              }
            ],
            legendOptions: {
              showLegend: true
            }
          }
        ]
      };

    },

    /**
     *
     * @param default_renderer
     * @param time_field
     */
    initializeEarthquakeRenderer: function (default_renderer, time_field) {

      const one_hour = (1000 * 60 * 60);

      return (date_time_value) => {

        const renderer = default_renderer.clone();
        renderer.defaultSymbol = null;
        renderer.visualVariables = [
          {
            type: "opacity",
            field: time_field,
            stops: [
              {
                label: "previous",
                opacity: 0.0,
                value: 0
              },
              {
                label: "-24 hours",
                opacity: 0.0,
                value: date_time_value - (one_hour * 24)
              },
              {
                label: "-12 hours",
                opacity: 0.8,
                value: date_time_value - (one_hour * 12)
              },
              {
                label: "now",
                opacity: 1.0,
                value: date_time_value
              },
              {
                label: "+12 hours",
                opacity: 0.0,
                value: date_time_value + (one_hour * 12)
              }
            ],
            legendOptions: {
              showLegend: true
            }

          }
        ];

        return renderer;
      }

    },

    /**
     *
     * @param layerView
     * @returns {function(*=)}
     */
    initializeHighlight: function (layerView) {

      // HIGHLIGHT //
      let highlightHandle = null;
      layerView.view.highlightOptions = {
        color: Color.named.yellow,
        haloOpacity: 0.6,
        fillOpacity: 0.1
      };

      this.clearHighlights = () => {
        if(highlightHandle) {
          highlightHandle.remove();
          highlightHandle = null;
        }
      };

      let query_handle = null;
      return (lava_polygon) => {
        query_handle && (!query_handle.isFulfilled()) && query_handle.cancel();

        const count_query = layerView.layer.createQuery();
        count_query.geometry = lava_polygon;

        query_handle = layerView.queryObjectIds(count_query).then((ids) => {
          dom.byId("parcels-count").innerHTML = number.format(ids.length);
          this.clearHighlights();
          highlightHandle = layerView.highlight(ids);
        });

      };

    },

    /**
     *
     * @param view
     */
    initializeUndergroundDisplay: function (view) {

      view.map.basemap.when(() => {

        // HIDE BASEMAP //
        /*const adjustDefaultBasemap = (opacity) => {
         view.map.basemap.baseLayers.concat(view.map.basemap.referenceLayers).forEach((basemapLayer) => {
         basemapLayer.opacity = opacity
         });
         };
         let isBasemapVisible = true;
         const hideBasemapBtn = dom.byId("hide-basemap-btn");
         on(hideBasemapBtn, "click", () => {
         isBasemapVisible = (!isBasemapVisible);
         adjustDefaultBasemap(isBasemapVisible ? 1.0 : 0.0);
         });*/


        // ALLOW UNDERGROUND NAVIGATION //
        view.map.ground.navigationConstraint = { type: "none" };

        // SEE THROUGH GROUND //
        const seeThroughBtn = domConstruct.create("button", {
          title: "Toggle Ground Opacity",
          className: "btn btn-clear icon-ui-experimental icon-ui-flush btn-disabled"
        });
        view.ui.add(seeThroughBtn, "top-right");
        on(seeThroughBtn, "click", () => {
          domClass.toggle(seeThroughBtn, "btn-clear icon-ui-check-mark");
          if(domClass.contains(seeThroughBtn, "icon-ui-check-mark")) {
            view.map.ground.opacity = 0.5;
            /* view.basemapTerrain.wireframe = {
               mode: "shader",
               wireOpacity: 1.0,
               surfaceOpacity: 0.0,
               width: 1,
               subdivision: "constant",
               subdivisionReduceLevels: 2
             };
             view.basemapTerrain.frontMostTransparent = false;*/
          } else {
            // view.basemapTerrain.wireframe = false;
            // view.basemapTerrain.frontMostTransparent = false;
            view.map.ground.opacity = 1.0;
          }
        });
        domClass.remove(seeThroughBtn, "btn-disabled");

        // CLIP EXTENT //
        /*const clipExtentBtn = dom.byId("clip-extent-btn");
        on(clipExtentBtn, "click", () => {
          domClass.toggle(clipExtentBtn, "btn-clear icon-ui-check-mark");
          view.clippingArea = domClass.contains(clipExtentBtn, "icon-ui-check-mark") ? view.extent.expand(0.8) : null;
        });
        domClass.remove(clipExtentBtn, "btn-disabled");*/

      });

    },

  });
});
