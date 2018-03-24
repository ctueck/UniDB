<?php

require 'include/constants.php';

$UniDB_ini = parse_ini_file("config.ini", true);
$UniDB_config = array();
foreach ($UniDB_ini AS $key => $val) {
	$dotpos = strpos($key,".");
	if ($dotpos === false) {	// TABLE
		$UniDB_config["tables"][$key] = $val;
	} elseif ($dotpos == 0) {
		if (substr($key,1,7)=="queries") {
			$UniDB_config["queries"][substr($key,9)] = $val;
		} elseif (substr($key,1,9)=="templates") {
			$UniDB_config["templates"][substr($key,11)] = $val;
		} else { 		// GLOBAL
			$UniDB_config[substr($key,1)] = $val;
		}
	} else {			// COLUMN
		$UniDB_config["tables"][substr($key, 0, $dotpos)]["columns"][substr($key, $dotpos+1)] = $val;
	}
}

?>
