/*
	OpenStreetBugs layer is free software: you can redistribute it
	and/or modify it under the terms of the GNU Affero General Public License
	as published by the Free Software Foundation, either version 3 of the
	License, or (at your option) any later version.

	This file is distributed in the hope that it will be useful, but
	WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
	or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public
	License <http://www.gnu.org/licenses/> for more details.

	Copyright © 2009–2011 Candid Dauth
*/

/**
 * A fully functional OpenStreetBugs layer. See http://openstreetbugs.schokokeks.org/.
 * Even though the OpenStreetBugs API originally does not intend this, you can create multiple instances of this Layer and add them to different maps (or to one single map for whatever crazy reason) without problems.
*/

OpenLayers.Layer.OpenStreetBugs = new OpenLayers.Class(OpenLayers.Layer.Markers, {
	/**
	 * The URL of the OpenStreetBugs API.
	 * @var String
	*/
	serverURL : "http://openstreetbugs.schokokeks.org/api/0.1/",

	/**
	 * Associative array (index: bug ID) that is filled with the bugs loaded in this layer
	 * @var String
	*/
	bugs : { },

	/**
	 * The username to be used to change or create bugs on OpenStreetBugs
	 * @var String
	*/
	username : "NoName",

	/**
	 * The icon to be used for an open bug
	 * @var OpenLayers.Icon
	*/
	iconOpen : new OpenLayers.Icon("http://openstreetbugs.schokokeks.org/client/open_bug_marker.png", new OpenLayers.Size(22, 22), new OpenLayers.Pixel(-11, -11)),

	/**
	 * The icon to be used for a closed bug
	 * @var OpenLayers.Icon
	*/
	iconClosed : new OpenLayers.Icon("http://openstreetbugs.schokokeks.org/client/closed_bug_marker.png", new OpenLayers.Size(22, 22), new OpenLayers.Pixel(-11, -11)),

	/**
	 * The projection of the coordinates sent by the OpenStreetBugs API.
	 * @var OpenLayers.Projection
	*/
	apiProjection : new OpenLayers.Projection("EPSG:4326"),

	/**
	 * If this is set to true, the user may not commit comments or close bugs.
	 * @var Boolean
	*/
	readonly : false,

	/**
	 * When the layer is hidden, all open popups are stored in this array in order to be re-opened again when the layer is made visible again.
	*/
	reopenPopups : [ ],

	/**
	 * The user name will be saved in a cookie if this isn’t set to false.
	 * @var Boolean
	*/
	setCookie : true,

	/**
	 * The lifetime of the user name cookie in days.
	 * @var Number
	*/
	cookieLifetime : 1000,

	/**
	 * The path where the cookie will be available on this server.
	 * @var String
	*/
	cookiePath : null,

	/**
	 * A URL to append lon=123&lat=123&zoom=123 for the Permalinks.
	 * @var String
	*/
	permalinkURL : "http://www.openstreetmap.org/",

	opacity : 0.7,
	projection : new OpenLayers.Projection("EPSG:4326"),

	/**
	 * @param String name
	*/
	initialize : function(name, options)
	{
		OpenLayers.Layer.Markers.prototype.initialize.apply(this, arguments);
		putAJAXMarker.layers.push(this);
		this.events.addEventType("markerAdded");

		this.events.register("visibilitychanged", this, this.updatePopupVisibility);
		this.events.register("visibilitychanged", this, this.loadBugs);

		var cookies = document.cookie.split(/;\s*/);
		for(var i=0; i<cookies.length; i++)
		{
			var cookie = cookies[i].split("=");
			if(cookie[0] == "osbUsername")
			{
				this.username = decodeURIComponent(cookie[1]);
				break;
			}
		}

		OpenLayers.Layer.OpenStreetBugs.setCSS();
	},

	/**
	 * Is automatically called when the layer is added to an OpenLayers.Map. Initialises the automatic bug loading in the visible bounding box.
	*/
	afterAdd : function()
	{
		var ret = OpenLayers.Layer.Markers.prototype.afterAdd.apply(this, arguments);

		this.map.events.register("moveend", this, this.loadBugs);
		this.loadBugs();

		return ret;
	},

	/**
	 * At the moment the OSB API responses to requests using JavaScript code. This way the Same Origin Policy can be worked around. Unfortunately, this makes communicating with the API a bit too asynchronous, at the moment there is no way to tell to which request the API actually responses.
	 * This method creates a new script HTML element that imports the API request URL. The API JavaScript response then executes the global functions provided below.
	 * @param String url The URL this.serverURL + url is requested.
	*/
	apiRequest : function(url)
	{
		var script = document.createElement("script");
		script.type = "text/javascript";
		script.src = this.serverURL + url + "&nocache="+(new Date()).getTime();
		document.body.appendChild(script);
	},

	/**
	 * Is automatically called when the visibility of the layer changes. When the layer is hidden, all visible popups
	 * are closed and their visibility is saved. When the layer is made visible again, these popups are re-opened.
	*/
	updatePopupVisibility : function()
	{
		if(this.getVisibility())
		{
			for(var i=0; i<this.reopenPopups.length; i++)
				this.reopenPopups[i].show();
			this.reopenPopups = [ ];
		}
		else
		{
			for(var i=0; i<this.markers.length; i++)
			{
				if(this.markers[i].feature.popup && this.markers[i].feature.popup.visible())
				{
					this.markers[i].feature.popup.hide();
					this.reopenPopups.push(this.markers[i].feature.popup);
				}
			}
		}
	},

	/**
	 * Sets the user name to be used for interactions with OpenStreetBugs.
	*/
	setUserName : function(username)
	{
		if(this.username == username)
			return;

		this.username = username;

		if(this.setCookie)
		{
			var cookie = "osbUsername="+encodeURIComponent(username);
			if(this.cookieLifetime)
				cookie += ";expires="+(new Date((new Date()).getTime() + this.cookieLifetime*86400000)).toGMTString();
			if(this.cookiePath)
				cookie += ";path="+this.cookiePath;
			document.cookie = cookie;
		}

		for(var i=0; i<this.markers.length; i++)
		{
			if(!this.markers[i].feature.popup) continue;
			var els = this.markers[i].feature.popup.contentDom.getElementsByTagName("input");
			for(var j=0; j<els.length; j++)
			{
				if(els[j].className != "osbUsername") continue;
				els[j].value = username;
			}
		}
	},

	/**
	 * Returns the currently set username or “NoName” if none is set.
	*/

	getUserName : function()
	{
		if(this.username)
			return this.username;
		else
			return "NoName";
	},

	/**
	 * Loads the bugs in the current bounding box. Is automatically called by an event handler ("moveend" event) that is created in the afterAdd() method.
	*/
	loadBugs : function()
	{
		if(!this.getVisibility())
			return true;

		var bounds = this.map.getExtent();
		if(!bounds) return false;
		bounds.transform(this.map.getProjectionObject(), this.apiProjection);

		this.apiRequest("getBugs"
			+ "?t="+this.round(bounds.top, 5)
			+ "&r="+this.round(bounds.right, 5)
			+ "&b="+this.round(bounds.bottom, 5)
			+ "&l="+this.round(bounds.left, 5));
	},

	/**
	 * Rounds the given number to the given number of digits after the floating point.
	 * @param Number number
	 * @param Number digits
	 * @return Number
	*/
	round : function(number, digits)
	{
		var factor = Math.pow(10, digits);
		return Math.round(number*factor)/factor;
	},

	/**
	 * Adds an OpenLayers.Marker representing a bug to the map. Is usually called by loadBugs().
	 * @param Number id The bug ID
	*/
	createMarker: function(id)
	{
		if(this.bugs[id])
		{
			if(this.bugs[id].popup && !this.bugs[id].popup.visible())
				this.setPopupContent(id);
			if(this.bugs[id].osbClosed != putAJAXMarker.bugs[id][2])
				this.bugs[id].destroy();
			else
				return;
		}

		var feature = this._createMarker(id, putAJAXMarker.bugs[id][0], putAJAXMarker.bugs[id][1], putAJAXMarker.bugs[id][2], (putAJAXMarker.bugs[id][2] ? this.iconClosed : this.iconOpen).clone());
		feature.osbId = id;
		feature.osbClosed = putAJAXMarker.bugs[id][2];
		feature.marker.feature = feature;
		feature.marker.events.registerPriority("click", feature, this.markerClick);
		feature.marker.events.register("mouseover", feature, this.markerMouseOver);
		feature.marker.events.register("mouseout", feature, this.markerMouseOut);

		this.bugs[id] = feature;

		this.events.triggerEvent("markerAdded");
	},

	/**
	 * Can be overloaded by subclasses in order to use a different marker creation mechanism. This does not create
	 * the popup yet, that is created later using the createPopup() method of the returned feature. The parameters
	 * about the popup content are only passed for the case that a special implementation needs them.
	 *
	 * The marker popup class has to support a DOM element as parameter for setContentHTML() and issue a "close" event
	 * when the popup is closed, like {@link OpenLayers.Popup.FramedCloud.OpenStreetBugs} does.
	 * @param Number id The bug ID or null when a bug is being created
	 * @param LonLat lonlat The coordinates in {@link #apiProjection} projection
	 * @param String comments The comments as HTML code or null when a bug is being created
	 * @param Boolean closed Whether the bug is closed. null when the bug is being created
	 * @param OpenLayers.Icon icon The suggested icon for the marker.
	 * @return OpenLayers.Feature the feature with the marker and the popup
	*/
	_createMarker: function(id, lonlat, comments, closed, icon)
	{
		lonlat = lonlat.clone().transform(this.apiProjection, this.map.getProjectionObject());

		var feature = new OpenLayers.Feature(this, lonlat, { icon: icon, autoSize: true });
		feature.popupClass = OpenLayers.Popup.FramedCloud.OpenStreetBugs;

		var marker = feature.createMarker();
		this.addMarker(marker);

		return feature;
	},

	/**
	 * Recreates the content of the popup of a marker.
	 * @param Number id The bug ID
	*/

	setPopupContent: function(id) {
		if(!this.bugs[id].popup)
			return;

		var el1,el2,el3;
		var layer = this;

		var newContent = document.createElement("div");

		el1 = document.createElement("h3");
		el1.appendChild(document.createTextNode(closed ? OpenLayers.i18n("Fixed Error") : OpenLayers.i18n("Unresolved Error")));

		el1.appendChild(document.createTextNode(" ["));
		el2 = document.createElement("a");
		el2.href = "#";
		el2.onclick = function(){ layer.map.setCenter(putAJAXMarker.bugs[id][0].clone().transform(layer.apiProjection, layer.map.getProjectionObject()), 15); };
		el2.appendChild(document.createTextNode(OpenLayers.i18n("Zoom")));
		el1.appendChild(el2);
		el1.appendChild(document.createTextNode("]"));

		if(this.permalinkURL)
		{
			el1.appendChild(document.createTextNode(" ["));
			el2 = document.createElement("a");
			el2.href = this.permalinkURL + (this.permalinkURL.indexOf("?") == -1 ? "?" : "&") + "lon="+putAJAXMarker.bugs[id][0].lon+"&lat="+putAJAXMarker.bugs[id][0].lat+"&zoom=15";
			el2.appendChild(document.createTextNode(OpenLayers.i18n("Permalink")));
			el1.appendChild(el2);
			el1.appendChild(document.createTextNode("]"));
		}
		newContent.appendChild(el1);

		var containerDescription = document.createElement("div");
		newContent.appendChild(containerDescription);

		var containerChange = document.createElement("div");
		newContent.appendChild(containerChange);

		var displayDescription = function(){
			containerDescription.style.display = "block";
			containerChange.style.display = "none";
			layer.bugs[id].popup.updateSize();
		};
		var displayChange = function(){
			containerDescription.style.display = "none";
			containerChange.style.display = "block";
			layer.bugs[id].popup.updateSize();
		};
		displayDescription();

		el1 = document.createElement("dl");
		for(var i=0; i<putAJAXMarker.bugs[id][1].length; i++)
		{
			el2 = document.createElement("dt");
			el2.className = (i == 0 ? "osb-description" : "osb-comment");
			el2.appendChild(document.createTextNode(i == 0 ? OpenLayers.i18n("Description") : OpenLayers.i18n("Comment")));
			el1.appendChild(el2);
			el2 = document.createElement("dd");
			el2.className = (i == 0 ? "osb-description" : "osb-comment");
			el2.appendChild(document.createTextNode(putAJAXMarker.bugs[id][1][i]));
			el1.appendChild(el2);
		}
		containerDescription.appendChild(el1);

		if(putAJAXMarker.bugs[id][2])
		{
			el1 = document.createElement("p");
			el1.className = "osb-fixed";
			el2 = document.createElement("em");
			el2.appendChild(document.createTextNode(OpenLayers.i18n("Has been fixed.")));
			el1.appendChild(el2);
			containerDescription.appendChild(el1);
		}
		else if(!this.readonly)
		{
			el1 = document.createElement("div");
			el2 = document.createElement("input");
			el2.setAttribute("type", "button");
			el2.onclick = function(){ displayChange(); };
			el2.value = OpenLayers.i18n("Comment/Close");
			el1.appendChild(el2);
			containerDescription.appendChild(el1);

			var el_form = document.createElement("form");
			el_form.onsubmit = function(){ if(inputComment.value.match(/^\s*$/)) return false; layer.submitComment(id, inputComment.value); layer.hidePopup(id); return false; };

			el1 = document.createElement("dl");
			el2 = document.createElement("dt");
			el2.appendChild(document.createTextNode(OpenLayers.i18n("Nickname")));
			el1.appendChild(el2);
			el2 = document.createElement("dd");
			var inputUsername = document.createElement("input");
			inputUsername.value = this.username;
			inputUsername.className = "osbUsername";
			inputUsername.onkeyup = function(){ layer.setUserName(inputUsername.value); };
			el2.appendChild(inputUsername);
			el1.appendChild(el2);

			el2 = document.createElement("dt");
			el2.appendChild(document.createTextNode(OpenLayers.i18n("Comment")));
			el1.appendChild(el2);
			el2 = document.createElement("dd");
			var inputComment = document.createElement("input");
			el2.appendChild(inputComment);
			el1.appendChild(el2);
			el_form.appendChild(el1);

			el1 = document.createElement("ul");
			el1.className = "buttons";
			el2 = document.createElement("li");
			el3 = document.createElement("input");
			el3.setAttribute("type", "submit");
			el3.value = OpenLayers.i18n("Add comment");
			el2.appendChild(el3);
			el1.appendChild(el2);

			el2 = document.createElement("li");
			el3 = document.createElement("input");
			el3.setAttribute("type", "button");
			el3.onclick = function(){ this.form.onsubmit(); layer.closeBug(id); layer.bugs[id].popup.hide(); return false; };
			el3.value = OpenLayers.i18n("Mark as fixed");
			el2.appendChild(el3);
			el1.appendChild(el2);
			el_form.appendChild(el1);
			containerChange.appendChild(el_form);

			el1 = document.createElement("div");
			el2 = document.createElement("input");
			el2.setAttribute("type", "button");
			el2.onclick = function(){ displayDescription(); };
			el2.value = OpenLayers.i18n("Cancel");
			el1.appendChild(el2);
			containerChange.appendChild(el1);
		}

		this.bugs[id].popup.setContentHTML(newContent);
	},

	/**
	 * Creates a new bug.
	 * @param OpenLayers.LonLat lonlat The coordinates in the API projection.
	 * @param String description
	*/
	createBug: function(lonlat, description) {
		this.apiRequest("addPOIexec"
			+ "?lat="+encodeURIComponent(lonlat.lat)
			+ "&lon="+encodeURIComponent(lonlat.lon)
			+ "&text="+encodeURIComponent(description + " [" + this.getUserName() + "]")
			+ "&format=js"
		);
	},

	/**
	 * Adds a comment to a bug.
	 * @param Number id
	 * @param String comment
	*/
	submitComment: function(id, comment) {
		this.apiRequest("editPOIexec"
			+ "?id="+encodeURIComponent(id)
			+ "&text="+encodeURIComponent(comment + " [" + this.getUserName() + "]")
			+ "&format=js"
		);
	},

	/**
	 * Marks a bug as fixed.
	 * @param Number id
	*/
	closeBug: function(id) {
		this.apiRequest("closePOIexec"
			+ "?id="+encodeURIComponent(id)
			+ "&format=js"
		);
	},

	/**
	 * Removes the content of a marker popup (to reduce the amount of needed resources).
	 * @param Number id
	*/
	resetPopupContent: function(id) {
		if(!this.bugs[id].popup)
			return;

		this.bugs[id].popup.setContentHTML(document.createElement("div"));
	},

	/**
	 * Makes the popup of the given marker visible. Makes sure that the popup content is created if it does not exist yet.
	 * @param Number id
	*/
	showPopup: function(id) {
		var add = null;
		if(!this.bugs[id].popup)
		{
			add = this.bugs[id].createPopup(true);
			add.events.register("close", this, function(){ this.resetPopupContent(id); if(this.bugs[id].osbClicked) this.bugs[id].osbClicked = false; });
		}
		else if(this.bugs[id].popup.visible())
			return;

		this.setPopupContent(id);
		if(add)
			this.map.addPopup(add);
		this.bugs[id].popup.show();
		this.bugs[id].popup.updateSize();
	},

	/**
	 * Hides the popup of the given marker.
	 * @param Number id
	*/
	hidePopup: function(id) {
		if(!this.bugs[id].popup || !this.bugs[id].popup.visible())
			return;

		this.bugs[id].popup.hide();
		this.bugs[id].popup.events.triggerEvent("close");
	},

	/**
	 * Is run on the “click” event of a marker in the context of its OpenLayers.Feature. Toggles the visibility of the popup.
	*/
	markerClick: function(e) {
		var feature = this; // Context is the feature

		feature.osbClicked = !feature.osbClicked;
		if(feature.osbClicked)
			feature.layer.showPopup(feature.osbId);
		else
			feature.layer.hidePopup(feature.osbId);
		OpenLayers.Event.stop(e);
		return false;
	},

	/**
	 * Is run on the “mouseover” event of a marker in the context of its OpenLayers.Feature. Makes the popup visible.
	*/
	markerMouseOver: function(e) {
		var feature = this; // Context is the feature

		feature.layer.showPopup(feature.osbId);
		OpenLayers.Event.stop(e);
	},

	/**
	 * Is run on the “mouseout” event of a marker in the context of its OpenLayers.Feature. Hides the popup (if it has not been clicked).
	*/
	markerMouseOut: function(e) {
		var feature = this; // Context is the feature

		if(!feature.osbClicked)
			feature.layer.hidePopup(feature.osbId);
		OpenLayers.Event.stop(e);
	},

	CLASS_NAME: "OpenLayers.Layer.OpenStreetBugs"
});

/**
 * Is called by the initialize() function and adds the stylesheets to the document.
*/
OpenLayers.Layer.OpenStreetBugs.setCSS = function() {
	if(OpenLayers.Layer.OpenStreetBugs.setCSS.done)
		return;
	else
		OpenLayers.Layer.OpenStreetBugs.setCSS.done = true;
	
	var rules = '.olPopupFramedCloudOpenStreetBugs dl { margin:0; padding:0; }' +
	            '.olPopupFramedCloudOpenStreetBugs dt { margin:0; padding:0; font-weight:bold; float:left; clear:left; }' +
	            '.olPopupFramedCloudOpenStreetBugs dt:after { content: ": "; }' +
	            '* html .olPopupFramedCloudOpenStreetBugs dt { margin-right:1ex; }' +
	            '.olPopupFramedCloudOpenStreetBugs dd { margin:0; padding:0; }' +
	            '.olPopupFramedCloudOpenStreetBugs ul.buttons { list-style-type:none; padding:0; margin:0; }' +
	            '.olPopupFramedCloudOpenStreetBugs ul.buttons li { display:inline; margin:0; padding:0; }' +
	            '.olPopupFramedCloudOpenStreetBugs h3 { font-size:1.2em; margin:.2em 0 .7em 0; }';
	
	var st = document.createElement("style");
	st.setAttribute("type", "text/css");
	if(st.styleSheet){ //IE method
		st.styleSheet.cssText = rules;
	}else{
	st.appendChild(document.createTextNode(rules));
	}
	document.getElementsByTagName("head")[0].appendChild(st);
};

/**
 * An OpenLayers control to create new bugs on mouse clicks on the map. Add an instance of this to your map using
 * the OpenLayers.Map.addControl() method and activate() it.
*/

OpenLayers.Control.OpenStreetBugs = new OpenLayers.Class(OpenLayers.Control, {
	title : null, // See below because of translation call

	/**
	 * The icon to be used for the temporary markers that the “create bug” popup belongs to.
	 * @var OpenLayers.Icon
	*/
	icon : new OpenLayers.Icon("http://openstreetbugs.schokokeks.org/client/icon_error_add.png", new OpenLayers.Size(22, 22), new OpenLayers.Pixel(-11, -11)),

	/**
	 * An instance of the OpenStreetBugs layer that this control shall be connected to. Is set in the constructor.
	 * @var OpenLayers.Layer.OpenStreetBugs
	*/
	osbLayer : null,

	/**
	 * @param OpenLayers.Layer.OpenStreetBugs osbLayer The OpenStreetBugs layer that this control will be connected to.
	*/
	initialize: function(osbLayer, options) {
		this.osbLayer = osbLayer;

		this.title = OpenLayers.i18n("Create OpenStreetBug");

		OpenLayers.Control.prototype.initialize.apply(this, [ options ]);

		this.events.register("activate", this, function() {
			if(!this.osbLayer.getVisibility())
				this.osbLayer.setVisibility(true);
		});

		this.osbLayer.events.register("visibilitychanged", this, function() {
			if(this.active && !this.osbLayer.getVisibility())
				this.osbLayer.setVisibility(true);
		});
	},

	destroy: function() {
		if (this.handler)
			this.handler.destroy();
		this.handler = null;

		OpenLayers.Control.prototype.destroy.apply(this, arguments);
	},

	draw: function() {
		this.handler = new OpenLayers.Handler.Click(this, {'click': this.click}, { 'single': true, 'double': false, 'pixelTolerance': 0, 'stopSingle': false, 'stopDouble': false });
	},

	/**
	 * Map clicking event handler. Adds a temporary marker with a popup to the map, the popup contains the form to add a bug.
	*/
	click: function(e) {
		if(!this.map) return true;

		var control = this;
		var lonlat = this.map.getLonLatFromViewPortPx(e.xy).transform(this.map.getProjectionObject(), this.osbLayer.apiProjection);
		var feature = this.osbLayer._createMarker(null, lonlat, null, null, this.icon.clone());
		feature.marker.feature = feature;

		var newContent = document.createElement("div");
		var el1,el2,el3;
		el1 = document.createElement("h3");
		el1.appendChild(document.createTextNode(OpenLayers.i18n("Create bug")));
		newContent.appendChild(el1);

		var el_form = document.createElement("form");
		el_form.onsubmit = function() { control.osbLayer.createBug(lonlat, inputDescription.value); feature.marker.feature = null; feature.destroy(); return false; };

		el1 = document.createElement("dl");
		el2 = document.createElement("dt");
		el2.appendChild(document.createTextNode(OpenLayers.i18n("Nickname")));
		el1.appendChild(el2);
		el2 = document.createElement("dd");
		var inputUsername = document.createElement("input");
		inputUsername.value = this.osbLayer.username;
		inputUsername.className = "osbUsername";
		inputUsername.onkeyup = function(){ control.osbLayer.setUserName(inputUsername.value); };
		el2.appendChild(inputUsername);
		el1.appendChild(el2);

		el2 = document.createElement("dt");
		el2.appendChild(document.createTextNode(OpenLayers.i18n("Bug description")));
		el1.appendChild(el2);
		el2 = document.createElement("dd");
		var inputDescription = document.createElement("input");
		el2.appendChild(inputDescription);
		el1.appendChild(el2);
		el_form.appendChild(el1);

		el1 = document.createElement("div");
		el2 = document.createElement("input");
		el2.setAttribute("type", "submit");
		el2.value = OpenLayers.i18n("Create");
		el1.appendChild(el2);
		el_form.appendChild(el1);
		newContent.appendChild(el_form);

		feature.data.popupContentHTML = newContent;
		var popup = feature.createPopup(true);
		popup.events.register("close", this, function(){ feature.destroy(); });
		this.map.addPopup(popup);
		popup.updateSize();
	},

	CLASS_NAME: "OpenLayers.Control.OpenStreetBugs"
});


/**
 * This class changes the usual OpenLayers.Popup.FramedCloud class by using a DOM element instead of an innerHTML string as content for the popup.
 * This is necessary for creating valid onclick handlers that still work with multiple OpenStreetBugs layer objects.
*/

OpenLayers.Popup.FramedCloud.OpenStreetBugs = new OpenLayers.Class(OpenLayers.Popup.FramedCloud, {
	contentDom : null,
	autoSize : true,

	/**
	 * See OpenLayers.Popup.FramedCloud.initialize() for parameters. As fourth parameter, pass a DOM node instead of a string.
	*/
	initialize: function() {
		this.displayClass = this.displayClass + " " + this.CLASS_NAME.replace("OpenLayers.", "ol").replace(/\./g, "");

		var args = new Array(arguments.length);
		for(var i=0; i<arguments.length; i++)
			args[i] = arguments[i];

		// Unset original contentHTML parameter
		args[3] = null;

		var closeCallback = arguments[6];

		// Add close event trigger to the closeBoxCallback parameter
		args[6] = function(e){ if(closeCallback) closeCallback(); else this.hide(); OpenLayers.Event.stop(e); this.events.triggerEvent("close"); };

		OpenLayers.Popup.FramedCloud.prototype.initialize.apply(this, args);

		this.events.addEventType("close");

		this.setContentHTML(arguments[3]);
	},

	/**
	 * Like OpenLayers.Popup.FramedCloud.setContentHTML(), but takes a DOM element as parameter.
	*/
	setContentHTML: function(contentDom) {
		if(contentDom != null)
			this.contentDom = contentDom;

		if(this.contentDiv == null || this.contentDom == null || this.contentDom == this.contentDiv.firstChild)
			return;

		while(this.contentDiv.firstChild)
			this.contentDiv.removeChild(this.contentDiv.firstChild);

		this.contentDiv.appendChild(this.contentDom);

		// Copied from OpenLayers.Popup.setContentHTML():
		if(this.autoSize)
		{
			this.registerImageListeners();
			this.updateSize();
		}
	},

	destroy: function() {
		this.contentDom = null;
		OpenLayers.Popup.FramedCloud.prototype.destroy.apply(this, arguments);
	},

	CLASS_NAME: "OpenLayers.Popup.FramedCloud.OpenStreetBugs"
});

/**
 * Necessary improvement to the translate function: Fall back to default language if translated string is not
 * available (see http://trac.openlayers.org/ticket/2308).
*/

OpenLayers.i18n = OpenLayers.Lang.translate = function(key, context) {
	var message = OpenLayers.Lang[OpenLayers.Lang.getCode()][key];
	if(!message)
	{
		if(OpenLayers.Lang[OpenLayers.Lang.defaultCode][key])
			message = OpenLayers.Lang[OpenLayers.Lang.defaultCode][key];
		else
			message = key;
	}
	if(context)
		message = OpenLayers.String.format(message, context);
	return message;
};

/**
 * This global function is executed by the OpenStreetBugs API getBugs script.
 * Each OpenStreetBugs layer adds itself to the putAJAXMarker.layer array. The putAJAXMarker() function executes the createMarker() method
 * on each layer in that array each time it is called. This has the side-effect that bugs displayed in one map on a page are already loaded
 * on the other map as well.
*/

function putAJAXMarker(id, lon, lat, text, closed)
{
	var comments = text.split(/<hr \/>/);
	for(var i=0; i<comments.length; i++)
		comments[i] = comments[i].replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
	putAJAXMarker.bugs[id] = [
		new OpenLayers.LonLat(lon, lat),
		comments,
		closed
	];
	for(var i=0; i<putAJAXMarker.layers.length; i++)
		putAJAXMarker.layers[i].createMarker(id);
}

/**
 * This global function is executed by the OpenStreetBugs API. The “create bug”, “comment” and “close bug” scripts execute it to give information about their success.
 * In case of success, this function is called without a parameter, in case of an error, the error message is passed. This is lousy workaround to make it any functional at all, the OSB API is likely to be extended later (then it will provide additional information such as the ID of a created bug and similar).
*/

function osbResponse(error)
{
	if(error)
		alert("Error: "+error);

	for(var i=0; i<putAJAXMarker.layers.length; i++)
		putAJAXMarker.layers[i].loadBugs();
}

putAJAXMarker.layers = [ ];
putAJAXMarker.bugs = { };


/* Translations */

OpenLayers.Lang.en = OpenLayers.Util.extend(OpenLayers.Lang.en, {
	"Fixed Error" : "Fixed Error",
	"Unresolved Error" : "Unresolved Error",
	"Description" : "Description",
	"Comment" : "Comment",
	"Has been fixed." : "This error has been fixed already. However, it might take a couple of days before the map image is updated.",
	"Comment/Close" : "Comment/Close",
	"Nickname" : "Nickname",
	"Add comment" : "Add comment",
	"Mark as fixed" : "Mark as fixed",
	"Cancel" : "Cancel",
	"Create OpenStreetBug" : "Create OpenStreetBug",
	"Create bug" : "Create bug",
	"Bug description" : "Bug description",
	"Create" : "Create",
	"Permalink" : "Permalink",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.de = OpenLayers.Util.extend(OpenLayers.Lang.de, {
	"Fixed Error" : "Behobener Fehler",
	"Unresolved Error" : "Offener Fehler",
	"Description" : "Beschreibung",
	"Comment" : "Kommentar",
	"Has been fixed." : "Der Fehler wurde bereits behoben. Es kann jedoch bis zu einigen Tagen dauern, bis die Kartenansicht aktualisiert wird.",
	"Comment/Close" : "Kommentieren/Schließen",
	"Nickname" : "Benutzername",
	"Add comment" : "Kommentar hinzufügen",
	"Mark as fixed" : "Als behoben markieren",
	"Cancel" : "Abbrechen",
	"Create OpenStreetBug" : "OpenStreetBug melden",
	"Create bug" : "Bug anlegen",
	"Bug description" : "Fehlerbeschreibung",
	"Create" : "Anlegen",
	"Permalink" : "Permalink",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.pl = OpenLayers.Util.extend(OpenLayers.Lang.pl, {
	"Fixed Error" : "Naprawiony błąd",
	"Unresolved Error" : "Nierozwiązany błąd",
	"Description" : "Opis",
	"Comment" : "Komentarz",
	"Has been fixed." : "Ten problem został już rozwiązany. Jednakże, może to potrwać kilka dni, zanim obraz mapy zostanie zaktualizowany.",
	"Comment/Close" : "Skomentuj/zamknij",
	"Nickname" : "Nick",
	"Add comment" : "Dodaj komentarz",
	"Mark as fixed" : "Oznacz jako rozwiązany",
	"Cancel" : "Anuluj",
	"Create OpenStreetBug" : "Stwórz OpenStreetBug",
	"Create bug" : "Stwórz problem",
	"Bug description" : "Opis problemu",
	"Create" : "Stwórz",
	"Permalink" : "Stały link",
	"Zoom" : "Przybliż"
});

OpenLayers.Lang.fr = OpenLayers.Util.extend(OpenLayers.Lang.fr, {
	"Fixed Error" : "Erreur corrigée",
	"Unresolved Error" : "Erreur non corrigée",
	"Description" : "Description",
	"Comment" : "Commentaire",
	"Has been fixed." : "Cette erreur a déjà été corrigée. Cependant, il peut être nécessaire d'attendre quelques jours avant que l'image de la carte ne soit mise à jour.",
	"Comment/Close" : "Commenter/Fermer",
	"Nickname" : "Surnom",
	"Add comment" : "Ajouter un commentaire",
	"Mark as fixed" : "Marquer comme corrigé",
	"Cancel" : "Annuler",
	"Create OpenStreetBug" : "Créer OpenStreetBug",
	"Create bug" : "Ajouter un bug",
	"Bug description" : "Description du bug",
	"Create" : "Créer",
	"Permalink" : "Lien permanent",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.nl = OpenLayers.Util.extend(OpenLayers.Lang.nl, {
	"Fixed Error" : "Fout verholpen",
	"Unresolved Error" : "Openstaande fout",
	"Description" : "Beschrijving",
	"Comment" : "Kommentaar",
	"Has been fixed." : "De fout is al eerder opgelost. Het kan echter nog een paar dagen duren voordat het kaartmateriaal geactualiseerd is.",
	"Comment/Close" : "Bekommentariëren/Sluiten",
	"Nickname" : "Gebruikersnaam",
	"Add comment" : "Kommentaar toevoegen",
	"Mark as fixed" : "Als opgelost aanmerken",
	"Cancel" : "Afbreken",
	"Create OpenStreetBug" : "OpenStreetBug melden",
	"Create bug" : "Bug melden",
	"Bug description" : "Foutomschrijving",
	"Create" : "Aanmaken",
	"Permalink" : "Permalink",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.it = OpenLayers.Util.extend(OpenLayers.Lang.it, {
	"Fixed Error" : "Sbaglio coretto",
	"Unresolved Error" : "Sbaglio non coretto",
	"Description" : "Descrizione",
	"Comment" : "Commento",
	"Has been fixed." : "Questo sbaglio è già coretto. Forse ci metto qualche giorni per aggiornare anche i quadri.",
	"Comment/Close" : "Commenta/Chiude",
	"Nickname" : "Nome",
	"Add comment" : "Aggiunge commento",
	"Mark as fixed" : "Marca che è coretto",
	"Cancel" : "Annulla",
	"Create OpenStreetBug" : "Aggiunge OpenStreetBug",
	"Create bug" : "Aggiunge un sbaglio",
	"Bug description" : "Descrizione del sbaglio",
	"Create" : "Aggiunge",
	"Permalink" : "Permalink",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.ro = OpenLayers.Util.extend(OpenLayers.Lang.ro, {
	"Fixed Error" : "Eroare rezolvată",
	"Unresolved Error" : "Eroare nerezolvată",
	"Description" : "Descriere",
	"Comment" : "Comentariu",
	"Has been fixed." : "Această eroare a fost rezolvată. Totuși este posibil să dureze câteva zile până când imaginea hărții va fi actualizată.",
	"Comment/Close" : "Comentariu/Închide",
	"Nickname" : "Nume",
	"Add comment" : "Adaugă comentariu",
	"Mark as fixed" : "Marchează ca rezolvată",
	"Cancel" : "Anulează",
	"Create OpenStreetBug" : "Crează OpenStreetBug",
	"Create bug" : "Adaugă eroare",
	"Bug description" : "Descrierea erorii",
	"Create" : "Adaugă",
	"Permalink" : "Permalink",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.hu = OpenLayers.Util.extend(OpenLayers.Lang.hu, {
	"Fixed Error" : "Javított hiba",
	"Unresolved Error" : "Megoldatlan hiba",
	"Description" : "Leírás",
	"Comment" : "Megjegyzés",
	"Has been fixed." : "Ezt a hibát már javították, azonban eltarthat néhány napig, mire a térkép frissül.",
	"Comment/Close" : "Megjegyzés/Bezárás",
	"Nickname" : "Becenév",
	"Add comment" : "Megjegyzés hozzáadása",
	"Mark as fixed" : "Jelölés javítottként",
	"Cancel" : "Mégse",
	"Create OpenStreetBug" : "OpenStreetBug létrehozása",
	"Create bug" : "Hiba létrehozása",
	"Bug description" : "Hiba leírása",
	"Create" : "Létrehozás",
	"Permalink" : "Permalink",
	"Zoom" : "Nagyítás"
});

OpenLayers.Lang.es = OpenLayers.Util.extend(OpenLayers.Lang.es, {
	"Fixed Error" : "Error Corregido",
	"Unresolved Error" : "Error sin corregir",
	"Description" : "Descripción",
	"Comment" : "Comentario",
	"Has been fixed." : "Este error ya ha sido corregido. De todas formas, puede que tarde un par de días antes de que la imagen del mapa se actualice.",
	"Comment/Close" : "Comentario/Cerrado",
	"Nickname" : "Nombre usuario",
	"Add comment" : "Añadir comentario",
	"Mark as fixed" : "Marcar como corregido",
	"Cancel" : "Cancelar",
	"Create OpenStreetBug" : "Crear OpenStreetBug",
	"Create bug" : "Crear bug",
	"Bug description" : "Descripcion del bug",
	"Create" : "Crear",
	"Permalink" : "Permalink",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.lt = OpenLayers.Util.extend(OpenLayers.Lang.lt, {
	"Fixed Error" : "Pataisyta klaida",
	"Unresolved Error" : "Neišspręsta klaida",
	"Description" : "Aprašymas",
	"Comment" : "Komentaras",
	"Has been fixed." : "Ši klaida jau pataisyta, bet gali užtrukti kelias dienas, kol žemėlapis bus atnaujintas.",
	"Comment/Close" : "Komentuoti/Uždaryti",
	"Nickname" : "Slapyvardis",
	"Add comment" : "Pridėti komentarą",
	"Mark as fixed" : "Pažymėti, kaip pataisytą",
	"Cancel" : "Atšaukti",
	"Create OpenStreetBug" : "Sukurti OpenStreetBug",
	"Create bug" : "Pažymėti klaidą",
	"Bug description" : "Klaidos aprašymas",
	"Create" : "Sukurti",
	"Permalink" : "Nuoroda",
	"Zoom" : "Padidinti"
});

OpenLayers.Lang.vi = OpenLayers.Util.extend(OpenLayers.Lang.vi, {
	"Fixed Error" : "Lỗi đã sửa",
	"Unresolved Error" : "Lỗi cần sửa",
	"Description" : "Miêu tả",
	"Comment" : "Bình luận",
	"Has been fixed." : "Lỗi này đã được sửa. Tuy nhiên, có thể cần chờ vài ngày cho bản đồ được cập nhật.",
	"Comment/Close" : "Bình luận/Đóng",
	"Nickname" : "Tên hiệu",
	"Add comment" : "Thêm bình luận",
	"Mark as fixed" : "Đánh dấu sửa",
	"Cancel" : "Hủy bỏ",
	"Create OpenStreetBug" : "Báo cáo lỗi OpenStreetBug",
	"Create bug" : "Báo cáo lỗi",
	"Bug description" : "Miêu tả lỗi",
	"Create" : "Báo cáo",
	"Permalink" : "Liên kết thường trực",
	"Zoom" : "Phóng lớn"
});

OpenLayers.Lang.ru = OpenLayers.Util.extend(OpenLayers.Lang.ru, {
	"Fixed Error" : "Исправленная ошибка",
	"Unresolved Error" : "Неисправленная ошибка",
	"Description" : "Описание",
	"Comment" : "Комментарий",
	"Has been fixed." : "Эта ошибка уже исправлена. Тем не менее, может пройти пара дней, перед тем как карта обновится.",
	"Comment/Close" : "Комментировать/Закрыть",
	"Nickname" : "Псевдоним",
	"Add comment" : "Добавить комментарий",
	"Mark as fixed" : "Пометить как исправленное",
	"Cancel" : "Отмена",
	"Create OpenStreetBug" : "Создать ОпенСтритБаг",
	"Create bug" : "Создать сообщение об ошибке",
	"Bug description" : "Описание ошибки",
	"Create" : "Создать",
	"Permalink" : "Постоянная ссылка",
	"Zoom" : "Масштаб"
});

OpenLayers.Lang.ast = OpenLayers.Util.extend(OpenLayers.Lang.ast, {
	"Fixed Error" : "Fallu correxíu",
	"Unresolved Error" : "Fallu ensin correxir",
	"Description" : "Descripción",
	"Comment" : "Comentariu",
	"Has been fixed." : "Esti fallu yá ta correxíu. De toles maneres, pue tardar un par de díes enantes de que s'anueve la imaxe del mapa.",
	"Comment/Close" : "Comentariu/Zarráu",
	"Nickname" : "Alcuñu",
	"Add comment" : "Amestar comentariu",
	"Mark as fixed" : "Marcar como correxíu",
	"Cancel" : "Encaboxar",
	"Create OpenStreetBug" : "Crear OpenStreetBug",
	"Create bug" : "Crear bug",
	"Bug description" : "Descripcion del bug",
	"Create" : "Crear",
	"Permalink" : "Enllaz permanente",
	"Zoom" : "Zoom"
});

OpenLayers.Lang.fi = OpenLayers.Util.extend(OpenLayers.Lang.fi, {
	"Fixed Error" : "Korjattu virhe",
	"Unresolved Error" : "Ratkaisematon virhe",
	"Description" : "Kuvaus",
	"Comment" : "Kommentti",
	"Has been fixed." : "Tämä virhe on jo korjattu. Sen päivittyminen kartalle saattaa kuitenkin kestää muutaman päivän.",
	"Comment/Close" : "Kommentti/Sulje",
	"Nickname" : "Nimimerkki",
	"Add comment" : "Lisää kommentti",
	"Mark as fixed" : "Merkitse korjatuksi",
	"Cancel" : "Peruuta",
	"Create OpenStreetBug" : "Luo uusi OpenStreetBug",
	"Create bug" : "Luo virhe",
	"Bug description" : "Virheen kuvaus",
	"Create" : "Luo",
	"Permalink" : "Ikilinkki",
	"Zoom" : "Zoom"
});
