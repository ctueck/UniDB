<?php

// MDB2 is our backend
require 'MDB2.php';

// different UniDB objects
require 'Query.inc.php';
require 'Column.inc.php';
require 'Table.inc.php';

class UniDB {

	protected $config;

	protected $dsn;
	public $dbh;

	protected $Tables = array();
	protected $Queries = array();

	protected $Related = array();

	public $Templates;

	protected $Debug;

	/* routing table for REST API - NB: static! */
	public static $routingTable = array(		// where to pass API calls
			"log" =>	array(	"GET" => "get_log"	),
			"tables" =>	array(	"GET" => "get_tables"	),
			"queries" =>	array(	"GET" => "get_queries",
						"POST" => "new_query"	),
			"search" =>	array(	"GET" => "get_search"	),
			"debug.echo" =>	array(	"GET" => "debug_echo",
						"PUT" => "debug_echo",
						"POST" => "debug_echo",
						"DELETE" => "debug_forbidden" ),
			"debug.dump" =>	array(	"GET" => "dumpObject" ),
		);

	/* Constructor */
	function UniDB(&$config, $username = null, $password = null) {
		/* log */
		$this->log("UniDB: instance constructed");

		/* config array */
		$this->config = $config;

		/* DSN from config constants */
		$this->dsn = array(	'phptype' => 'mysql',
					'username' => (isset($username) ? $username : $this->conf('db_user')),
					'password' => (isset($password) ? $password : $this->conf('db_pass')),
					'hostspec' => $this->conf('db_host'),
					'database' => $this->conf('db_name'),
					'charset' => 'utf8' );

		// connect to database
		$this->connect();

		// --- previous function will cause an error if login is incorrect

		$this->log("UniDB: checking templates:\n");
		// load templates (needs to be before table/query init)
		foreach ($this->config['templates'] as $template) {
			if (is_file($template['file'])) {
				$this->Templates[$template['name']] = $template;
				$this->log("[TEMPL] ".$template['name'].": ".$template['description']);
			} else {
				$this->log("WARNING: template '".$template['file']."' does not exist.");
			}
		}

		$this->log("UniDB: initialising tables:\n");

		/* get list of tables */
		$r = $this->dbh->query("SELECT table_name FROM information_schema.tables
					WHERE table_schema = ".$this->dbh->quote($this->conf('db_name')));

		if (PEAR::isError($r)) {
			$this->error($r->getMessage());
		}

		// first: tables
		while ($row = $r->fetchRow(MDB2_FETCHMODE_ORDERED)) {
			if (! $this->conf('ignore', $row[0])) {
				$this->T($row[0])->initQuery();
			} else {
				$this->log("[IGN]   ".$row[0]);
			}
		}

		// sort by table description
		uasort($this->Tables, function ($a,$b) {
			return(strcasecmp($a->tableDescription, $b->tableDescription));
		});

		$this->log("UniDB: initialising system queries:\n");

		// second: system queries
		foreach ($this->config["queries"] as $queryname => $queryconf) {
			$queryname = '.system.'.$queryname;
			$queryconf['name'] = $queryname;
			if (isset($queryconf['sql'])) {	// Query with raw SQL -> SimpleQuery
				$this->Queries[$queryname] = new SimpleQuery($this, $queryconf);
			} else {
				$this->Queries[$queryname] = new Query($this, $queryconf);
			}
		}
		// shared + user queries will be loaded separately by the frontend

	}

	/*************************************** internal functions *************************************************/
	/* returning data with return()                                                                             */

	public function connectInfo () {
	/* return info on connection - for display in UI */
		return("Connected: ".$this->dsn['username']."@".$this->dsn['hostspec'].":".$this->dsn['database']);
	}

	public function loggedUser () {
	/* return username of DB connection @ remote host */
		return($this->dsn['username'].'@'.$_SERVER['REMOTE_ADDR']);
	}

	public function dbName () {
	/* return name of the DB we're logged in to */
		return($this->dsn['database']);
	}

	public function userQueryDir() {
		$userQueryDir = ( $this->conf('userquerydir') ?: 'config/queries' ) . '/' . $this->dsn['username'] . '.d';
		if (!is_dir($userQueryDir)) {
			mkdir($userQueryDir);
		}
		return( $userQueryDir );
	}

	public function publicQueryDir() {
		$publicQueryDir = ( $this->conf('userquerydir') ?: 'config/queries' ) . '/_public_';
		if (!is_dir($publicQueryDir)) {
			mkdir($publicQueryDir);
		}
		return( $publicQueryDir );
	}

	public function loadQueries($mtime = null) {
		$newQueries = false;
		// read user queries
		if (isset($mtime)) {
			$this->log("Updating queries:");
		} else {
			$this->log("Loading queries from '".$this->userQueryDir()."':");
		}
		foreach(glob($this->userQueryDir().'/*') as $filename) {
			if (!isset($mtime) || filemtime($filename) > $mtime) {
				$newQuery = new SimpleQuery($this, unserialize(file_get_contents($filename)));
				$this->Queries[$newQuery->name] = $newQuery;
				$newQueries = true;
			}
		}
		// read public queries
		if (!isset($mtime)) {
			$this->log("Loading queries from '".$this->publicQueryDir()."':");
		}
		foreach(glob($this->publicQueryDir().'/*') as $filename) {
			if (!isset($mtime) || filemtime($filename) > $mtime) {
				$newQuery = new SimpleQuery($this, unserialize(file_get_contents($filename)));
				$this->Queries[$newQuery->name] = $newQuery;
				$newQueries = true;
			}
		}
		// compatibility mode: read user queries from old-style file
		$compatfile = ($this->conf('userquerydir') ?: 'config/queries' ) . '/' . $this->dsn['username'];
		if (is_file($compatfile) && ( !isset($mtime) || filemtime($compatfile) > $mtime ) ) {
			$newQueries = true;
			$this->log("Loading queries from old-style file '".$compatfile."':");
			// old-style query file
			foreach(unserialize(file_get_contents($compatfile)) as $queryconf) {
				$newQuery = new SimpleQuery($this, $queryconf);
				$this->Queries[$newQuery->name] = $newQuery;
				$this->Queries[$newQuery->name]->save();
			}
			unlink($compatfile);
		}
		return($newQueries);
	}

	public function conf($var, $table = null, $column = null) {
	/* read configuration variable $var for $table and $column (optional) */
		if (isset($table) && isset($column)) {
			/* column scope */
			return(isset($this->config['tables'][$table]['columns'][$column][$var]) ? $this->config['tables'][$table]['columns'][$column][$var] : null);
		} elseif (isset($table)) {
			/* table scope */
			return(isset($this->config['tables'][$table][$var]) ? $this->config['tables'][$table][$var] : null);
		} else {
			/* global scope */
			return(isset($this->config['global'][$var]) ? $this->config['global'][$var] : null);
		}
	}

	public function error($msg, $code = 500) {
		// add error to log (this will decode PEAR errors)
		$msg = $this->log($msg, true);
		// set http code
		http_response_code($code);
		// return the last error as JSON object (full log should be retrieved via $this->printLog() )
		header("Content-type: application/json");
		die(json_encode(array(	"UniDB_fatalError" =>	$msg)));
	}

	public function log($msg, $fatal = false) {
	/* add an entry to the log, and end execution if $fatal */
		if (strlen($this->Debug) > $this->conf("logsize")) {	// rotate log if needed
			$this->Debug = "[...]\n\n".substr($this->Debug, -$this->conf("logsize"));
		}
		// PEAR error can be passed directly and will be "decoded"
		if (PEAR::isError($msg)) {
			$msg = $msg->getMessage()."\n\n".$msg->getUserinfo();
		}
		// fatal messages will be formatted
		if ($fatal) {
			$this->Debug .= '<span style="color: red;">Fatal error: '. $msg . "</span>\n";
		} else {
			$this->Debug .= $msg . "\n";
		}
		return($msg);
	}

	public function T($tableName) {
	/* return the Table object for $tableName, after having initialised it if not exists */
		if (!isset($this->Tables[$tableName])) {
			$this->Tables[$tableName] = "INIT";	// if called again, this will lead to recursion being detected
			$this->Tables[$tableName] = new Table($this, $tableName);
		} elseif (!($this->Tables[$tableName] instanceof Table)) {
			// RECURSION
			$this->error("RECURSION DETECTED: Table '$tableName' called while being initialised.");
		}
		return($this->Tables[$tableName]);
	}

	public function Q($queryName) {
	/* return the Query object, if it exists */
		return( isset($this->Queries[$queryName]) ? $this->Queries[$queryName] : null );
	}

	public function tableNames() {
	/* return all table names as an array */
		foreach ($this->Tables as $name => $t) {
			$names[] = $name;
		}
		return($names);
	}

	public function addRelated($table, $column, $relatedTable, $relatedColumn, $unique, $mode) {
	/* add information about a related table */
		$this->Related[$table][] = array( 	"column" => $column,
							"relatedTable" => $relatedTable ,
							"relatedColumn" => $relatedColumn,
							"unique" => $unique,
							"mode" => $mode );
	}

	public function searchRelated($table, $fieldset) {
	/* search information about related tables */
		$this->log("Searching related records for $table [".$fieldset[$this->T($table)->priKey]["value"]."] :");
		$related = array();
		if (isset($this->Related[$table])) {
			foreach ($this->Related[$table] as $rt) {
				$rt["value"] = $fieldset[$rt["column"]]["value"];
				$rt["count"] = $this->dbh->queryOne("SELECT COUNT(*) FROM ".$rt["relatedTable"]." WHERE ".
						$rt["relatedColumn"]." = ".
						$this->dbh->quote($rt["value"]));
				$related[] = $rt;
				$this->log(" - ".$rt["relatedTable"].": ".$rt["count"]);
			}
		}
		return($related);
	}

	public function selectExpr($fields, $depth = 0, $countQuery = false) {
	// return SELECT query for the $fields passed as array (or all fields if '*' passed)
	// default: default SELECT expression generated by the constructor
		$select = array();
		$joins = array();
		// get arrays of SELECT expressions and JOINs
		foreach ($fields as $table => $columns) {
			$merge = $this->T($table)->selectExprRec($columns, $depth);	
			$select  = array_merge($select,  $merge['select']);
			$joins   = array_merge($joins,   $merge['joins']);
		}
		// build the query
		$query = 'SELECT    ';
		// all expressions are given
		$query .= $countQuery ? 'COUNT(*)' : implode($select,",\n          ");
		// we are the main table
		$query .= "\nFROM      ( ".implode(", ",array_keys($fields))." )";
		// now build JOIN clauses
		foreach ($joins AS $join) {
			$query .= "\nLEFT JOIN ".$join['table'].' AS '.$join['as'].' ON ( '.$join['on'].' )';
		}
		return($query);
	}

	public function connect() {
	/* connect to the database */
		$this->dbh = MDB2::connect($this->dsn);
		if (PEAR::isError($this->dbh)) {
			$this->error($this->dbh->getUserInfo(),401);
		}
		$this->dbh->setFetchMode(MDB2_FETCHMODE_ASSOC);
		$this->log("\nUniDB: connected to database");
	}

	public function __wakeup () {
	/* the wakeup function re-connects to the database */
		$this->connect();
	}

	/*************************************** external functions *************************************************/
	/* returning data in JSON format                                                                            */

	public function get_log() {
		$log = $this->Debug;
		$this->Debug = "";
		return(array("UniDB_log" => $log));
	}

	public function get_tables() {
		$tables = array();
		foreach ($this->Tables as $name => $t) {
			$tables[$name] = $t->getInfo();
		}
		return(	array(	"UniDB_motd" =>	$this->connectInfo(),
				"uiconfig" =>	$this->config["ui"],
				"tables" =>	$tables ));
	}

	public function get_queries($Id, $options) {
		if (isset($options["mtime"])) {
			$mtime = $options["mtime"];
		} else {
			$mtime = null;
		}
		$queries = array();
		$newtime = time();
		if ($this->loadQueries($mtime)) {
			$this->log("new queries loaded - returning array.");
			foreach ($this->Queries as $name => $q) {
				$queries[$name] = $q->getInfo();
			}
		} else {
			$this->log("no new queries.");
		}
		return(array(	"mtime" =>	$newtime,
				"queries" =>	( count($queries) > 0 ? $queries : null ) ) );
	}

	public function new_query($Id, $options) {
		// create an ad-hoc Query
		$newQuery = new SimpleQuery($this, $options);
		$this->Queries[$newQuery->name] = $newQuery;
		$newQuery->save();

		return( array(	"name" =>	$newQuery->name,
				"info" =>	$newQuery->getInfo() ) );
	}

	public function get_search($Id, $options) {
		$matchList = array();
		foreach ($this->Tables as $name => $t) {
			$matchList = array_merge($matchList,$t->search($options));
		}
		if (count($matchList) == 0) {
			$matchList[] = array( "category" => "No results found, try again." );
		}
		return($matchList);
	}

	/*********************************************** API **********************************************************/
	/**** this function routes REST API calls to the appropriate internal function(s)                          ****/
	/**************************************************************************************************************/

	protected function api_getResultContentType () {
		$types_offered = array(	"application/json",
					"text/plain",
					"text/csv",
					"text/html" );
		$types_requested = explode(",", $_SERVER['HTTP_ACCEPT']);

		foreach ($types_requested as $content_type) {
			$content_type = trim($content_type);
			if (strpos($content_type,";")) {
				$content_type = substr($content_type,0,strpos($content_type,";"));
			}
			if (in_array($content_type,$types_offered)) {
				return($content_type);
			} elseif ($content_type == '*/*') {
				return($types_offered[0]);
			}
		}
		$this->error("Could not provide any of the content-types requested by client: [".
			implode(",",$types_requested)."]", 406);
		return(false);
	}

	public function api ($Method, $Section, $Object, $Id) {
	/* execute a command specified in the query string, either from UniDB object or Table object */

		// we can use either GET or POST/PUT - in the latter case, we have to read from STDIN
		if ($Method == "GET" || $Method == "HEAD") {
			$options = $_GET;
		} else {
			$options = json_decode(file_get_contents("php://input"), true);
		}

		// now, need to determine which Object's routing table we'll use
		$call_object = null;
		$call_function = null;

		/******************* check object we'll have to call ***************************************/

		switch ($Section) {
			case 'table':
				$call_object = ( isset($this->Tables[$Object]) ? $this->T($Object) : null );
				break;
			case 'query':
				$call_object = ( isset($this->Queries[$Object]) ? $this->Queries[$Object] : null );
				break;
			case 'system':
				$call_object = $this;
				$Id = $Object;
				break;
			default:
				$this->error("Unknown section [$Section]",404);
				break;
		}

		/******************* check routing table for the element specified by Id    ****************/

		$call_class = get_class($call_object);
		if (empty($Id) && isset($call_class::$routingTable["NULL"])) {
			$route = $call_class::$routingTable["NULL"];
		} elseif (isset($call_class::$routingTable[$Id])) {
			$route = $call_class::$routingTable[$Id];
		} elseif (isset($call_class::$routingTable["*"])) {
			$route = $call_class::$routingTable["*"];
		} else {
			$this->error("Route for element [$Id] not defined, and no default route specified.", 404);
		}

		/******************* check function for this Method ***************************************/

		// 1. special case: HEAD = GET, but we'll discard returnData later
		if ($Method == "HEAD") {
			$Method = "GET";
			$method_is_HEAD = 1;
		} else {
			$method_is_HEAD = 0;
		}
		// 2. special case: OPTIONS = allowed for all, returning available methods
		if ($Method == "OPTIONS") {
			header("Allow: OPTIONS," . join(array_keys($route),","));
			$returnData = null;
		// regular case: check if method is defined
		} else if (isset($route[$Method]) && is_callable(array($call_object,$route[$Method]))) {
			$this->log("Calling: (".get_class($call_object).")".$Object."->".$route[$Method]."(Id=".(isset($Id)?$Id:"NULL").")");
			$returnData = call_user_func(array($call_object, $route[$Method]), $Id, $options);
		// if not defined: we'll return a 405 error
		} else {
			header("Allow: OPTIONS," . join(array_keys($route),","));
			$this->error("Method [$Method] not defined for [$Object]:[$Id] in [$Section]", 405);
		}

		// determine preferred content type for returning the result
		$resultContentType = $this->api_getResultContentType();

		if (isset($returnData)) {
			switch ($resultContentType) {
				case "application/json" :	// encode all as JSON data
					$json_returnData = json_encode($returnData);
					break;
				case "text/csv" :		// return in CSV format (only works with 2-dimensional array)
					$csv = fopen('php://memory', 'r+');
					foreach($returnData as $returnLine) {
						fputcsv($csv, $returnLine);
					}
					rewind($csv);
					$json_returnData = stream_get_contents($csv);
					fclose($csv);
					break;
				case "text/plain" :		// not used in production, but who knows?
					$json_returnData = print_r($returnData, true);
					break;
				case "text/html" :		// not used in production, but who knows?
					$json_returnData = "<html><body><pre>".print_r($returnData, true)."</pre></body></html>";
					break;
				default :
					$this->error("Use of content-type [$resultContentType] not properly defined", 500);
			}
			http_response_code(200);
			header("Content-type: $resultContentType");
			if ($method_is_HEAD) {
				header("Content-Length: ".strlen($json_returnData));
			} else {
				echo($json_returnData);
			}
		} else {
			http_response_code(204);
		}
	}

	/*************************************** DEBUG functions *************************************************/
	/* returning data in text/plain                                                                          */

	/* commented out by default because the dump would contain cleartext password */
	/**/
	public function dumpObject() {
		header("Content-type: text/plain");
		print_r($this);
	}
	public function debug_echo($Id, $options) {
		return($options);
	}
	public function debug_forbidden($Id, $options) {
		$this->error("Call to (UniDB)debug_forbidden.", 403);
	}
	/**/

}

?>
