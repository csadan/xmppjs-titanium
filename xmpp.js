// xmpp.js - Server-side XMPP in Javascript
// (C) 2010 Matthew Wild
// This project is released under the MIT/X11
// license. For more info see the COPYING file.


// External libs
var xml = require("./node-xml");

// This lib
var xmpp = exports;

// Wraps a function so that its 'this' is always 'context' when called
var recontext = function(context, f) {
	return function() {
		return f.apply(context, arguments);
	};
};
function timeout(fun, wait) {
	return setTimeout(fun, wait)
}

xmpp.xmlns = {
	streams : "http://etherx.jabber.org/streams",
	component_accept : "jabber:component:accept",
	chatstates : "http://jabber.org/protocol/chatstates"
};

xmpp.Status = {
	ERROR : 0,
	CONNECTING : 1,
	CONNFAIL : 2,
	AUTHENTICATING : 3,
	AUTHFAIL : 4,
	CONNECTED : 5,
	DISCONNECTED : 6,
	DISCONNECTING : 7,
};

xmpp.LogLevel = {
	DEBUG : 0,
	INFO : 1,
	WARN : 2,
	ERROR : 3,
	FATAL : 4
};




/** XMPPStream: Takes a parser, eats bytes, fires callbacks on stream events **/
xmpp.Stream = function(callbacks) {
	this.callbacks = callbacks;
	var stream = this;
	var stanza;

	this.parser = new xml.SaxParser(function(cb) {
		cb.onStartElementNS(function(tagname, attr_arr, prefix, uri, namespaces) {
			var attr = {};
			if (uri != xmpp.xmlns.component_accept)
				attr.xmlns = uri;
			for (var i = 0; i < attr_arr.length; i++)
				attr[attr_arr[i][0]] = attr_arr[i][1];
			for (var i = 0; i < namespaces.length; i++)
				if (namespaces[i][0].length > 0)
					attr["xmlns:" + namespaces[i][0]] = namespaces[i][1];
			if (!stanza) {
				if (stream.opened)
					stanza = xmpp.stanza(tagname, attr);
				else if (tagname == "stream" && uri == xmpp.xmlns.streams) {
					stream.opened = true;
					callbacks.opened(attr);
				} else {
					alert("no-stream");
				}
			} else {
				stanza.c(tagname, attr);
			}

		});

		cb.onEndElementNS(function(tagname) {

			if (stanza)
				if (stanza.last_node.length == 1) {
					callbacks.stanza(stanza);
					stanza = null;
				} else
					stanza.up();
			else {
				stream.opened = false;
				callbacks.closed();
			}
		});

		cb.onCharacters(function(chars) {
			if (stanza)
				stanza.t(chars);
		});

	});

	this.data = function(data) {
		return this.parser.parseString(data);
	}

	return this;
};

/** Connection: Takes host/port, manages stream **/
xmpp.Connection = function(host, port) {
	this.host = host || "localhost";
	this.port = port || 5347;

	this.stream = new xmpp.Stream({
		opened : recontext(this, this._stream_opened),
		stanza : recontext(this, this._handle_stanza),
		closed : recontext(this, this._stream_closed)
	});

	this._uniqueId = 0;

	return this;
};

exports.Connection.prototype = {
	connect : function(jid, pass, callback) {
		this.jid = jid;
		this.password = pass;
		this.connect_callback = callback;

		var conn = this;

		// Note that tcp.createConnection also initiates the connection.
		// This doesn't appear to create problems with adding listeners
		// afterward, but should be kept in mind should any arise.
		//this.socket = tcp.createConnection(this.port, this.host)

		this.socket = Ti.Network.Socket.createTCP({
			host : this.host,
			port : this.port,
			mode : Ti.Network.READ_WRITE_MODE,
			connected : function(e) {
				e.socket.fireEvent("read");
				e.socket.fireEvent("connect");
				e.socket.fireEvent("auth");
			},
			error : function(e) {
				//alert(e.error);
				//Ti.API.info('Error (' + e.errorCode + '): ' + e.error);
			}
		});
		this.socket.connect();
		this.socket.setTimeout(0);
		// Because Node's default timeout is 60s

		this.socket.addEventListener("read", recontext(this, conn.receive)); //lanzará el evento data
		this.socket.addEventListener("connect", recontext(this, conn._socket_connected));
		this.socket.addEventListener("auth", recontext(this, conn._stream_opened));
		
		this.socket.addEventListener("disconnect", recontext(this, conn._socket_disconnected));
		this.socket.addEventListener("data", recontext(this, conn._socket_received));


		this.handlers = [];

		this._setStatus(xmpp.Status.CONNECTING);
	},

	send : function(data) {
		this.debug("SND: " + data);
		this.socket.write(Ti.createBuffer({
			value : data.toString()
		}));
	},

	setState: function(state,params){
		switch(state) {
		case 'ausente':
			this.send("presence xmlns='jabber:client' id='"+this.getUniqueId()+"'><priority>40</priority><show>away</show><x xmlns='vcard-temp:x:update'><photo/></x></presence>'");		
		break;
		case 'avaiable':
			 this.send("presence xmlns='jabber:client' id='"+this.getUniqueId()+"'><priority>50</priority><x xmlns='vcard-temp:x:update'><photo/></x></presence>'");		
		break;
		case 'busy':
			this.send("presence xmlns='jabber:client' id='"+this.getUniqueId()+"'><priority>40</priority><show>dnd</show><x xmlns='vcard-temp:x:update'><photo/></x></presence>'");		
		break;
		case 'unavaiable':
			this.send("presence xmlns='jabber:client' id='"+this.getUniqueId()+"'><priority>40</priority><show>xa</show><x xmlns='vcard-temp:x:update'><photo/></x></presence>'");		
		break;
		default://Android
	}
		this.send("<stream:stream xmlns='jabber:component:accept' xmlns:stream='http://etherx.jabber.org/streams' to='" + getDomainFromJid(this.jid) + "'>");
	},

	//necesidad de crear el wrapper debido a que sino da problemas con el stream.
	receive_wrapper: function(){
		this.receive();
	},
	//TODO: añadida función de recepción de datos
	receive : function() {
		var that = this;
		
		var rbuffer = Ti.createBuffer({
			length : 1024
		});
	
		var read_callback = function(stream) {
			var data = Ti.Codec.decodeString({
				source : rbuffer,
				length : +stream.bytesProcessed
			});
			that.socket.fireEvent('data', {
				data : data
			});
			//alert("receive: "+data);
			if(typeof pasa === "undefined"){
					alert("Preparado para recibir mensajes de chat");
					pasa=true;
			}
		}
		Ti.Stream.read(this.socket, rbuffer, read_callback);
		timeout(recontext(this,this.receive_wrapper),100); //lanza el wrapper tras esperar 1 segundo
	},

	sendIQ : function(iq, on_result, on_error) {
		if (!iq.attr.id)
			iq.attr.id = this.getUniqueId();
		this.addHandler(function(reply) {
			if (reply.attr.type == "result")
				return on_result(reply);
			elseif(on_error)
			return on_error(reply);
			return false;

		}, null, "iq", null, iq.attr.id);
		this.send(iq);
	},

	addHandler : function(handler, ns, name, type, id, from, options) {
		return this.handlers.push({
			callback : handler,
			xmlns : ns,
			name : name,
			type : type,
			id : id,
			from : from,
			matchBare : options && options.matchBare
		});
	},

	getUniqueId : function(suffix) {
		return ++this._uniqueId + ( suffix ? (":" + suffix) : "");
	},

	// Update the status of the connection, call connect_callback
	_setStatus : function(status, condition) {
		this.status = status;
		this.connect_callback(status, condition);
	},

	// Socket listeners, called on TCP-level events
	_socket_connected : function() {
		this.info("CONNECTED.");
		this.send("<stream:stream xmlns='jabber:component:accept' xmlns:stream='http://etherx.jabber.org/streams' to='" + getDomainFromJid(this.jid) + "'>");
	},

	_socket_disconnected : function(had_error) {
		if (this.status == xmpp.Status.CONNECTING)
			this._setStatus(xmpp.Status.CONNFAIL);
		elseif(this.status == xmpp.Status.CONNECTED)
		this._setStatus(xmpp.Status.DISCONNECTED);
		this.info("DISCONNECTED.");
	},

	_socket_received : function(e) {
		this.debug("RCV: " + e);
		// Push to parser
		this.stream.data(e.data);
	},

	// Stream listeners, called on XMPP-level events
	_stream_opened : function(attr) {
		this.debug("STREAM: opened.");
		this._setStatus(xmpp.Status.AUTHENTICATING);

		var buffer = Ti.createBuffer({
			length : 1
		});
		Ti.Codec.encodeNumber({
			source : 0,
			dest : buffer,
			type : Ti.Codec.TYPE_BYTE
		});
		
		var handshake = Ti.Utils.base64encode(buffer + getNodeFromJid(this.jid) + buffer + this.password);
		this.send('<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">' + handshake + '</auth>');

	},

	_handle_stanza : function(stanza) {

			if (stanza.name == "success") {
				this._setStatus(xmpp.Status.CONNECTED);
			}

		this.debug("STANZA: " + stanza.toString());

		// Match and call handlers
		var removeHandlers = [];
		for (var i = 0; i < this.handlers.length; i++) {
			var handler = this.handlers[i];
			if ((!handler.name || handler.name == stanza.name) && 
				(!handler.xmlns || (handler.xmlns == stanza.attr.xmlns || (stanza.tags[0] 
																			&& handler.xmlns == stanza.tags[0].attr.xmlns))) && 
				(!handler.type || handler.type == stanza.attr.type) && 
				(!handler.id || handler.id == stanza.attr.id) && 
				(!handler.from || (handler.from == (handler.matchBare ? xmpp.getBareJID(stanza.attr.from) : stanza.attr.from))) && 
				(!handler.to || (handler.to == (handler.matchBare ? xmpp.getBareJID(stanza.attr.to) : stanza.attr.to)))) {
				var ret = handler.callback(stanza);
				if (ret == false)
					removeHandlers.push(i);
			}
		}

		var adjust = 0;
		for (var i = 0; i < removeHandlers.length; i++)
			this.handlers.splice(removeHandlers[i] - (adjust++), 1);
	},

	_stream_closed : function() {
		this.debug("STREAM: closed.");
		this.socket.close();
		if (this.status == xmpp.Status.CONNECTING)
			this._setStatus(xmpp.status.CONNFAIL);
		else
			this._setStatus(xmpp.Status.DISCONNECTED);
	},

	_stream_error : function(condition) {
		this._setStatus(xmpp.Status.ERROR, condition);
	},

	// Logging
	log : function(level, message) {
	},
	debug : function(message) {
		return this.log(xmpp.LogLevel.DEBUG, message);
	},
	info : function(message) {
		return this.log(xmpp.LogLevel.INFO, message);
	},
	warn : function(message) {
		return this.log(xmpp.LogLevel.WARN, message);
	},
	error : function(message) {
		return this.log(xmpp.LogLevel.ERROR, message);
	},
	fatal : function(message) {
		return this.log(xmpp.LogLevel.FATAL, message);
	}
};

function getBareJidFromJid(jid) {
	return jid ? jid.split("/")[0] : null;
};

function getNodeFromJid(jid) {
	if (jid.indexOf("@") < 0) {
		return null;
	}
	return jid.split("@")[0];
};

function getDomainFromJid(jid) {
	var bare = getBareJidFromJid(jid);
	if (bare.indexOf("@") < 0) {
		return bare;
	} else {
		var parts = bare.split("@");
		parts.splice(0, 1);
		return parts.join('@');
	}
};

function xmlescape(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/\'/g, "&apos;");
}

/** StanzaBuilder: Helps create and manipulate XML snippets **/
xmpp.StanzaBuilder = function(name, attr) {
	this.name = name;
	this.attr = attr || {};
	this.tags = [];
	this.children = [];
	this.last_node = [this];
	return this;
};

xmpp.StanzaBuilder.prototype = {
	s : function(name, attr) {
		// This function was created because c() doesn't seem to work for adding
		// multiple children on the same level with each other. This is just a
		// quick fix mostly to get chatstates working.
		var s = new xmpp.StanzaBuilder(name, attr);
		var parent = this;
		parent.tags.push(s);
		parent.children.push(s);
		this.last_node.push(s);
		return this
	},

	c : function(name, attr) {
		var s = new xmpp.StanzaBuilder(name, attr);
		var parent = this.last_node[this.last_node.length - 1];
		parent.tags.push(s);
		parent.children.push(s);
		this.last_node.push(s);
		return this;
	},

	t : function(text) {
		var parent = this.last_node[this.last_node.length - 1];
		parent.children.push(text);
		return this;
	},

	up : function() {
		this.last_node.pop();
		return this;
	},

	toString : function(top_tag_only) {
		var buf = [];
		buf.push("<" + this.name);
		for (var attr in this.attr) {
			buf.push(" " + attr + "='" + xmlescape(this.attr[attr]) + "'");
		}

		// Now add children if wanted
		if (top_tag_only) {
			buf.push(">");
		} else if (this.children.length == 0) {
			buf.push("/>");
		} else {
			buf.push(">");
			for (var i = 0; i < this.children.length; i++) {
				var child = this.children[i];
				if ( typeof (child) == "string")
					buf.push(xmlescape(child));
				else
					buf.push(child.toString());
			}
			buf.push("</" + this.name + ">");
		}
		return buf.join("");
	},

	getChild : function(name, xmlns) {
		for (var i = 0; i < this.tags.length; i++) {
			var child = this.tags[i];
			if ((!name || child.name == name) && (!xmlns || child.attr.xmlns == xmlns))
				return child;
		}
		return null;
	},

	getText : function() {
		var buf = [];
		for (var i = 0; i < this.children.length; i++)
			if ( typeof (this.children[i]) == "string")
				buf.push(this.children[i]);
		return buf.join("");
	},

	getAttribute : function(name) {
		return this.attr[name] || null;
	}
}

xmpp.stanza = function(name, attr) {
	return new xmpp.StanzaBuilder(name, attr);
}

xmpp.message = function(attr) {
	return xmpp.stanza("message", attr);
}

xmpp.presence = function(attr) {
	return xmpp.stanza("presence", attr);
}

xmpp.iq = function(attr) {
	return xmpp.stanza("iq", attr);
}
