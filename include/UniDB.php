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
			$this->log($r->getMessage(),true);
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

	public function log($msg, $fatal = null) {
	/* add an entry to the log, and end execution if $fatal */
		if (strlen($this->Debug) > $this->conf("logsize")) {	// rotate log if needed
			$this->Debug = "[...]\n\n".substr($this->Debug, -$this->conf("logsize"));
		}
		if ($fatal) {
			$this->Debug .= '<span style="color: red;">Fatal error: '. $msg . "</span>\n";
			// return the last error as JSON object (full log should be retrieved via $this->printLog() ) 
			header("Content-type: application/json");
			die(json_encode(array(	"UniDB_fatalError" =>	$msg)));
		} else {
			$this->Debug .= $msg . "\n";
		}
	}

	public function T($tableName) {
	/* return the Table object for $tableName, after having initialised it if not exists */
		if (!isset($this->Tables[$tableName])) {
			$this->Tables[$tableName] = "INIT";	// if called again, this will lead to recursion being detected
			$this->Tables[$tableName] = new Table($this, $tableName);
		} elseif (!($this->Tables[$tableName] instanceof Table)) {
			// RECURSION
			$this->log("RECURSION DETECTED: Table '$tableName' called while being initialised.", true);
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

	public function execCmd () {
	/* execute a command specified in the query string, either from UniDB object or Table object */
		// we can use either GET or POST
		$options = isset($_GET['__UniDB']) ? $_GET : ( isset($_POST['__UniDB']) ? $_POST : null );
		// get command
		$cmd	= isset($options['__UniDB']) ? $options['__UniDB'] : null;
		$table	= isset($options['__table']) ? $options['__table'] : null;

		// log the whole array
		//$this->log("execCmd: ".print_r($options,true));

		if (isset($cmd) && isset($table)) {	// it's related to a Table or Query object
			if (isset($this->Tables[$table]) && is_callable(array($this->T($table),$cmd))) {
				$this->log("Calling: (UniDB)->T($table)->$cmd");
				$returnData = $this->T($table)->$cmd($options);
			} elseif (isset($this->Queries[$table]) && is_callable(array($this->Queries[$table],$cmd))) {
				$this->log("Calling: (UniDB)->Queries[$table]->$cmd");
				$returnData = $this->Queries[$table]->$cmd($options);
			} else {
				$this->log("Invalid UniDB command: $cmd", true);
			}
		} else if (isset($cmd)) {		// it's an UniDB object method
			if ($cmd == "execCmd") {
				$this->log("Recursion detected: calling 'execCmd' is not allowed.", true);
			} elseif (is_callable(array($this,$cmd))) {
				$this->log("Calling: (UniDB)->$cmd");
				$returnData = $this->$cmd($options);
			} else {
				$this->log("Invalid UniDB command: $cmd", true);
			}
		} else {				// no command - we just return an empty object
			$this->log("No UniDB command given, or no table specified in GET or POST.");
			$returnData = array();
		}

		if (isset($returnData)) {
			// return all as JSON data
			header("Content-type: application/json");
			echo(json_encode($returnData));
		}
	}

	public function connect() {
	/* connect to the database */
		$this->dbh = MDB2::connect($this->dsn);
		if (PEAR::isError($this->dbh)) {
			$this->log($this->dbh->getMessage(), true);
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

	public function printLog() {
		$log = $this->Debug;
		$this->Debug = "";
		return(array("UniDB_log" => $log));
	}

	public function getTables() {
		$tables = array();
		foreach ($this->Tables as $name => $t) {
			$tables[$name] = $t->getInfo();
		}
		return(	array(	"UniDB_motd" =>	$this->connectInfo(),
				"uiconfig" =>	$this->config["ui"],
				"tables" =>	$tables ));
	}

	public function getQueries($options) {
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

	public function newSimpleQuery($options) {
		// create an ad-hoc Query
		$newQuery = new SimpleQuery($this, $options);
		$this->Queries[$newQuery->name] = $newQuery;
		$newQuery->save();

		return( array(	"name" =>	$newQuery->name,
				"info" =>	$newQuery->getInfo() ) );
	}

	public function search($options) {
		$matchList = array();
		foreach ($this->Tables as $name => $t) {
			$matchList = array_merge($matchList,$t->search($options));
		}
		if (count($matchList) == 0) {
			$matchList[] = array( "category" => "No results found, try again." );
		}
		return($matchList);
	}

	function resultToOdt($options, $r) {
	// return SQL query result as meta data in an ODT file

		if (! (isset($_FILES['__odtfile']) || isset($options['__template'])) ) {
			$this->log("cannot download single result: no file uploaded and no template specified",true);
		}

		define('NS_ODF_OFFICE',	'urn:oasis:names:tc:opendocument:xmlns:office:1.0');
		define('NS_ODF_META',	'urn:oasis:names:tc:opendocument:xmlns:meta:1.0');

		$odtfile = new ZipArchive;

		if (isset($options['__template'])) {
			$filename = basename($this->Templates[$options['__template']]['file']);
			$filetype = $this->Templates[$options['__template']]['type'];
			$filepath = tempnam(sys_get_temp_dir(), $filename);
			if (!copy($this->Templates[$options['__template']]['file'], $filepath)) {
				$this->log("could not create temporary file",true);
			}
		} else {
			$filepath = $_FILES['__odtfile']['tmp_name'];
			$filename = $_FILES['__odtfile']['name'];
			$filetype = $_FILES['__odtfile']['type'];
		}
		$odtfile->open($filepath);

		$metadata = new DOMDocument();
		$metadata->loadXML($odtfile->getFromName('meta.xml'));

		$metanode = $metadata->getElementsByTagNameNS(NS_ODF_OFFICE,'meta')->item(0);
		$metaprefix = $metanode->lookupPrefix(NS_ODF_META);
		$deleteNodes = array();
		foreach ($metanode->childNodes as $element) {
			if(array_key_exists($element->getAttributeNS(NS_ODF_META,'name'),$r)) {
				$deleteNodes[] = $element;
			}
		}
		foreach ($deleteNodes as $element) {
			$metanode->removeChild($element);
		}
		foreach ($r as $field => $value) {
			$newnode = $metadata->createElementNS(NS_ODF_META,$metaprefix.':user-defined', $value);
			$newnode->setAttributeNS(NS_ODF_META,$metaprefix.':name',$field);
			$newnode->setAttributeNS(NS_ODF_META,$metaprefix.':value-type','string');
			$metanode->appendChild($newnode);
		} // foreach (over all columns)

		if ($odtfile->addFromString("meta.xml",$metadata->saveXML()) && $odtfile->close()) {

			header("Content-type: $filetype");
			header("Content-Disposition: attachment; filename=$filename");

			readfile($filepath);
			unlink($filepath);
			flush();

			return(null);
		}

	}

	/*************************************** DEBUG functions *************************************************/
	/* returning data in text/plain                                                                          */

	/* commented out by default because the dump would contain cleartext password */
	/**/
	public function dumpObject() {
		header("Content-type: text/plain");
		print_r($this);
		return(null);
	}
	/**/

}

?>
